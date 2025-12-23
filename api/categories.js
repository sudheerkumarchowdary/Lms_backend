// Categories API endpoints (Admin only)

const express = require('express')
const sql = require('mssql')
const { authenticate, authorize } = require('../middleware/auth')

const router = express.Router()

// Get connection string
const connectionString = process.env.AZURE_SQL_CONNECTION_STRING || 
  'Server=tcp:lmsstorage.database.windows.net,1433;Initial Catalog=sessionslms;Persist Security Info=False;User ID=lmsadmin;Password=Lms@2025;MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;'

// Get all categories (Admin only)
router.get('/', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const pool = await sql.connect(connectionString)
    
    // Get categories with counts of subcategories, subjects, and topics
    const result = await pool.request().query(`
      SELECT 
        c.*,
        u.name as created_by_name,
        (SELECT COUNT(*) FROM SubCategories WHERE category_id = c.id AND status = 'Active') as subCategories_count,
        (SELECT COUNT(*) FROM Subjects s 
         INNER JOIN SubCategories sc ON s.sub_category_id = sc.id 
         WHERE sc.category_id = c.id AND s.status = 'Active') as subjects_count,
        (SELECT COUNT(*) FROM Topics t
         INNER JOIN Subjects s ON t.subject_id = s.id
         INNER JOIN SubCategories sc ON s.sub_category_id = sc.id
         WHERE sc.category_id = c.id AND t.status = 'Active') as topics_count
      FROM Categories c
      LEFT JOIN Users u ON c.created_by = u.id
      ORDER BY c.name ASC
    `)

    res.json(result.recordset)
  } catch (error) {
    console.error('Get categories error:', error)
    // If hierarchy tables don't exist, return categories without counts
    try {
      const pool = await sql.connect(connectionString)
      const result = await pool.request().query(`
        SELECT c.*, u.name as created_by_name,
               0 as subCategories_count,
               0 as subjects_count,
               0 as topics_count
        FROM Categories c
        LEFT JOIN Users u ON c.created_by = u.id
        ORDER BY c.name ASC
      `)
      res.json(result.recordset)
    } catch (fallbackError) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  }
})

// Get single category
router.get('/:id', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const pool = await sql.connect(connectionString)
    
    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT c.*, u.name as created_by_name
        FROM Categories c
        LEFT JOIN Users u ON c.created_by = u.id
        WHERE c.id = @id
      `)

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Category not found' })
    }

    res.json(result.recordset[0])
  } catch (error) {
    console.error('Get category error:', error)
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Create category (Admin only)
router.post('/', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const { name, description, status } = req.body

    if (!name) {
      return res.status(400).json({ message: 'Category name is required' })
    }

    const pool = await sql.connect(connectionString)

    // Verify the user exists in sessionslms database
    const userCheck = await pool
      .request()
      .input('userId', sql.Int, req.user.userId)
      .query('SELECT id FROM Users WHERE id = @userId')

    if (userCheck.recordset.length === 0) {
      console.error(`User ID ${req.user.userId} not found in sessionslms database`)
      return res.status(400).json({ 
        message: `User ID ${req.user.userId} not found in database. Please login again.`,
        error: 'User not found'
      })
    }

    const result = await pool
      .request()
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || null)
      .input('status', sql.NVarChar, status || 'Active')
      .input('created_by', sql.Int, req.user.userId)
      .query(`
        INSERT INTO Categories (name, description, status, created_by)
        OUTPUT INSERTED.id, INSERTED.name, INSERTED.description, INSERTED.status, INSERTED.created_by, INSERTED.created_at, INSERTED.updated_at
        VALUES (@name, @description, @status, @created_by)
      `)

    console.log('Category created successfully:', result.recordset[0])
    res.status(201).json(result.recordset[0])
  } catch (error) {
    console.error('Create category error:', error)
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      number: error.number,
    })
    
    let errorMessage = 'Server error'
    if (error.message.includes('FOREIGN KEY')) {
      if (error.message.includes('created_by') || error.message.includes('Users')) {
        errorMessage = 'Invalid user. Please login again.'
      } else {
        errorMessage = 'Database constraint error: ' + error.message
      }
    } else if (error.message.includes('UNIQUE') || error.message.includes('duplicate')) {
      errorMessage = 'Category name already exists. Please use a different name.'
    } else {
      errorMessage = error.message || 'Failed to create category'
    }
    
    res.status(500).json({ 
      message: errorMessage,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
})

// Update category (Admin only)
router.put('/:id', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const { name, description, status } = req.body

    const pool = await sql.connect(connectionString)

    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || null)
      .input('status', sql.NVarChar, status || null)
      .query(`
        UPDATE Categories
        SET name = @name,
            description = @description,
            status = COALESCE(@status, status),
            updated_at = GETDATE()
        OUTPUT INSERTED.*
        WHERE id = @id
      `)

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Category not found' })
    }

    res.json(result.recordset[0])
  } catch (error) {
    console.error('Update category error:', error)
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Delete category (Admin only)
router.delete('/:id', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const pool = await sql.connect(connectionString)

    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM Categories WHERE id = @id')

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Category not found' })
    }

    res.json({ message: 'Category deleted successfully' })
  } catch (error) {
    console.error('Delete category error:', error)
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

module.exports = router

