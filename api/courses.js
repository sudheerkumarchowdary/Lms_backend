// Courses API endpoints (Tutors can manage their own, Admins can manage all)

const express = require('express')
const sql = require('mssql')
const { authenticate } = require('../middleware/auth')

const router = express.Router()

// Get connection string
const connectionString = process.env.AZURE_SQL_CONNECTION_STRING || 
  'Server=tcp:lmsstorage.database.windows.net,1433;Initial Catalog=sessionslms;Persist Security Info=False;User ID=lmsadmin;Password=Lms@2025;MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;'

// Get all courses (Tutors see their own, Admins see all)
router.get('/', authenticate, async (req, res) => {
  try {
    const pool = await sql.connect(connectionString)
    
    // Check if Courses table exists
    const tableCheck = await pool.request().query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'Courses'
    `)

    if (tableCheck.recordset.length === 0) {
      console.error('Courses table not found')
      return res.status(500).json({ 
        message: 'Courses table not found. Please create the Courses table in your database.',
        error: 'Table not found'
      })
    }
    
    let query = `
      SELECT 
        c.*,
        cat.name as category_name,
        sc.name as sub_category_name,
        u.name as author_name,
        c.enrollments_count as enrollments
      FROM Courses c
      LEFT JOIN Categories cat ON c.category_id = cat.id
      LEFT JOIN SubCategories sc ON c.sub_category_id = sc.id
      LEFT JOIN Users u ON c.author_id = u.id
    `

    // If user is Tutor/Mentor, only show their courses
    if (req.user.role === 'Mentor' || req.user.role === 'Tutor') {
      query += ` WHERE c.author_id = ${req.user.userId}`
    }

    query += ' ORDER BY c.created_at DESC'

    const result = await pool.request().query(query)

    // Transform data for frontend
    const courses = result.recordset.map(course => ({
      id: course.id,
      title: course.title,
      description: course.description,
      thumbnail: course.thumbnail,
      category: course.category_name || '',
      category_id: course.category_id,
      subCategory: course.sub_category_name || '',
      sub_category_id: course.sub_category_id,
      creationDate: course.created_at ? new Date(course.created_at).toISOString().split('T')[0] : '',
      enrollments: course.enrollments || course.enrollments_count || 0,
      status: course.status || 'Draft',
      author: course.author_name || '',
      author_id: course.author_id,
    }))

    res.json(courses)
  } catch (error) {
    console.error('Get courses error:', error)
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      number: error.number
    })
    
    // Provide more specific error messages
    if (error.message.includes('Invalid object name') || error.message.includes('Courses')) {
      return res.status(500).json({ 
        message: 'Courses table not found. Please create the Courses table in your database.',
        error: error.message
      })
    }
    
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message 
    })
  }
})

// Get single course
router.get('/:id', authenticate, async (req, res) => {
  try {
    const pool = await sql.connect(connectionString)
    
    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT 
          c.*,
          cat.name as category_name,
          sc.name as sub_category_name,
          u.name as author_name
        FROM Courses c
        LEFT JOIN Categories cat ON c.category_id = cat.id
        LEFT JOIN SubCategories sc ON c.sub_category_id = sc.id
        LEFT JOIN Users u ON c.author_id = u.id
        WHERE c.id = @id
      `)

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Course not found' })
    }

    const course = result.recordset[0]

    // Check if user has permission (Tutor can only see their own)
    if ((req.user.role === 'Mentor' || req.user.role === 'Tutor') && course.author_id !== req.user.userId) {
      return res.status(403).json({ message: 'Access denied. You can only view your own courses.' })
    }

    res.json({
      id: course.id,
      title: course.title,
      description: course.description,
      thumbnail: course.thumbnail,
      category: course.category_name || '',
      category_id: course.category_id,
      subCategory: course.sub_category_name || '',
      sub_category_id: course.sub_category_id,
      creationDate: course.created_at ? new Date(course.created_at).toISOString().split('T')[0] : '',
      enrollments: course.enrollments_count || 0,
      status: course.status || 'Draft',
      author: course.author_name || '',
      author_id: course.author_id,
    })
  } catch (error) {
    console.error('Get course error:', error)
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Create course (Tutors and Admins)
router.post('/', authenticate, async (req, res) => {
  try {
    const { title, description, thumbnail, category_id, sub_category_id, status } = req.body

    if (!title || !category_id) {
      return res.status(400).json({ message: 'Title and category are required' })
    }

    // Only Tutors/Mentors and Admins can create courses
    if (req.user.role !== 'Admin' && req.user.role !== 'Mentor' && req.user.role !== 'Tutor') {
      return res.status(403).json({ message: 'Access denied. Only Tutors and Admins can create courses.' })
    }

    const pool = await sql.connect(connectionString)

    // Verify user exists
    const userCheck = await pool
      .request()
      .input('userId', sql.Int, req.user.userId)
      .query('SELECT id FROM Users WHERE id = @userId')

    if (userCheck.recordset.length === 0) {
      return res.status(400).json({ 
        message: `User ID ${req.user.userId} not found. Please login again.`,
        error: 'User not found'
      })
    }

    // Verify category exists
    const categoryCheck = await pool
      .request()
      .input('categoryId', sql.Int, category_id)
      .query('SELECT id FROM Categories WHERE id = @categoryId')

    if (categoryCheck.recordset.length === 0) {
      return res.status(400).json({ message: 'Category not found' })
    }

    // Verify subcategory exists if provided
    if (sub_category_id) {
      const subCategoryCheck = await pool
        .request()
        .input('subCategoryId', sql.Int, sub_category_id)
        .query('SELECT id FROM SubCategories WHERE id = @subCategoryId AND category_id = @categoryId')

      if (subCategoryCheck.recordset.length === 0) {
        return res.status(400).json({ message: 'SubCategory not found or does not belong to the selected category' })
      }
    }

    const result = await pool
      .request()
      .input('title', sql.NVarChar, title)
      .input('description', sql.NVarChar, description || null)
      .input('thumbnail', sql.NVarChar, thumbnail || null)
      .input('category_id', sql.Int, category_id)
      .input('sub_category_id', sql.Int, sub_category_id || null)
      .input('status', sql.NVarChar, status || 'Draft')
      .input('author_id', sql.Int, req.user.userId)
      .query(`
        INSERT INTO Courses (title, description, thumbnail, category_id, sub_category_id, status, author_id)
        OUTPUT INSERTED.id, INSERTED.title, INSERTED.description, INSERTED.thumbnail, INSERTED.category_id, INSERTED.sub_category_id, INSERTED.status, INSERTED.author_id, INSERTED.created_at, INSERTED.updated_at
        VALUES (@title, @description, @thumbnail, @category_id, @sub_category_id, @status, @author_id)
      `)

    console.log('Course created successfully:', result.recordset[0])
    res.status(201).json(result.recordset[0])
  } catch (error) {
    console.error('Create course error:', error)
    res.status(500).json({ 
      message: error.message || 'Failed to create course',
      error: error.message
    })
  }
})

// Update course (Tutors can update their own, Admins can update all)
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { title, description, thumbnail, category_id, sub_category_id, status } = req.body

    const pool = await sql.connect(connectionString)

    // First, check if course exists and get author_id
    const courseCheck = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT author_id FROM Courses WHERE id = @id')

    if (courseCheck.recordset.length === 0) {
      return res.status(404).json({ message: 'Course not found' })
    }

    const course = courseCheck.recordset[0]

    // Check permissions: Tutors can only update their own courses
    if ((req.user.role === 'Mentor' || req.user.role === 'Tutor') && course.author_id !== req.user.userId) {
      return res.status(403).json({ message: 'Access denied. You can only update your own courses.' })
    }

    // Verify category if provided
    if (category_id) {
      const categoryCheck = await pool
        .request()
        .input('categoryId', sql.Int, category_id)
        .query('SELECT id FROM Categories WHERE id = @categoryId')

      if (categoryCheck.recordset.length === 0) {
        return res.status(400).json({ message: 'Category not found' })
      }
    }

    // Verify subcategory if provided
    if (sub_category_id) {
      const subCategoryCheck = await pool
        .request()
        .input('subCategoryId', sql.Int, sub_category_id)
        .input('categoryId', sql.Int, category_id || courseCheck.recordset[0].category_id)
        .query('SELECT id FROM SubCategories WHERE id = @subCategoryId AND category_id = @categoryId')

      if (subCategoryCheck.recordset.length === 0) {
        return res.status(400).json({ message: 'SubCategory not found or does not belong to the selected category' })
      }
    }

    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .input('title', sql.NVarChar, title)
      .input('description', sql.NVarChar, description || null)
      .input('thumbnail', sql.NVarChar, thumbnail || null)
      .input('category_id', sql.Int, category_id || null)
      .input('sub_category_id', sql.Int, sub_category_id || null)
      .input('status', sql.NVarChar, status || null)
      .query(`
        UPDATE Courses
        SET title = COALESCE(@title, title),
            description = COALESCE(@description, description),
            thumbnail = COALESCE(@thumbnail, thumbnail),
            category_id = COALESCE(@category_id, category_id),
            sub_category_id = COALESCE(@sub_category_id, sub_category_id),
            status = COALESCE(@status, status),
            updated_at = GETDATE()
        OUTPUT INSERTED.*
        WHERE id = @id
      `)

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Course not found' })
    }

    res.json(result.recordset[0])
  } catch (error) {
    console.error('Update course error:', error)
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Delete course (Tutors can delete their own, Admins can delete all)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const pool = await sql.connect(connectionString)

    // First, check if course exists and get author_id
    const courseCheck = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT author_id FROM Courses WHERE id = @id')

    if (courseCheck.recordset.length === 0) {
      return res.status(404).json({ message: 'Course not found' })
    }

    const course = courseCheck.recordset[0]

    // Check permissions: Tutors can only delete their own courses
    if ((req.user.role === 'Mentor' || req.user.role === 'Tutor') && course.author_id !== req.user.userId) {
      return res.status(403).json({ message: 'Access denied. You can only delete your own courses.' })
    }

    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM Courses WHERE id = @id')

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Course not found' })
    }

    res.json({ message: 'Course deleted successfully' })
  } catch (error) {
    console.error('Delete course error:', error)
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

module.exports = router
