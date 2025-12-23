// Modules API endpoints (Mentor/Tutor only)

const express = require('express')
const sql = require('mssql')
const { authenticate, authorize } = require('../middleware/auth')

const router = express.Router()

// Get connection string
const connectionString = process.env.AZURE_SQL_CONNECTION_STRING || 
  'Server=tcp:lmsstorage.database.windows.net,1433;Initial Catalog=sessionslms;Persist Security Info=False;User ID=lmsadmin;Password=Lms@2025;MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;'

// Get all modules (Mentors can see their own, Admins can see all)
router.get('/', authenticate, async (req, res) => {
  try {
    const pool = await sql.connect(connectionString)
    
    let query = `
      SELECT m.*, u.name as mentor_name
      FROM Modules m
      LEFT JOIN Users u ON m.mentor_id = u.id
    `

    // If user is Mentor, only show their modules
    if (req.user.role === 'Mentor') {
      query += ` WHERE m.mentor_id = ${req.user.userId}`
    }

    query += ' ORDER BY m.created_at DESC'

    const result = await pool.request().query(query)

    res.json(result.recordset)
  } catch (error) {
    console.error('Get modules error:', error)
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Get single module
router.get('/:id', authenticate, async (req, res) => {
  try {
    const pool = await sql.connect(connectionString)
    
    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT m.*, u.name as mentor_name
        FROM Modules m
        LEFT JOIN Users u ON m.mentor_id = u.id
        WHERE m.id = @id
      `)

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Module not found' })
    }

    const module = result.recordset[0]

    // If user is Mentor, only allow access to their own modules
    if (req.user.role === 'Mentor' && module.mentor_id !== req.user.userId) {
      return res.status(403).json({ message: 'Access denied' })
    }

    res.json(module)
  } catch (error) {
    console.error('Get module error:', error)
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Create module (Mentor only)
router.post('/', authenticate, authorize('Mentor'), async (req, res) => {
  try {
    const { title, description, content, course_id, duration, order_number, status } = req.body

    if (!title) {
      return res.status(400).json({ message: 'Title is required' })
    }

    const pool = await sql.connect(connectionString)

    const result = await pool
      .request()
      .input('title', sql.NVarChar, title)
      .input('description', sql.NVarChar, description || null)
      .input('content', sql.NVarChar, content || null)
      .input('course_id', sql.Int, course_id || null)
      .input('duration', sql.Int, duration || null)
      .input('order_number', sql.Int, order_number || 0)
      .input('status', sql.NVarChar, status || 'Draft')
      .input('mentor_id', sql.Int, req.user.userId)
      .query(`
        INSERT INTO Modules (title, description, content, course_id, duration, order_number, status, mentor_id)
        OUTPUT INSERTED.*
        VALUES (@title, @description, @content, @course_id, @duration, @order_number, @status, @mentor_id)
      `)

    res.status(201).json(result.recordset[0])
  } catch (error) {
    console.error('Create module error:', error)
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Update module (Mentor only - can only update their own)
router.put('/:id', authenticate, authorize('Mentor'), async (req, res) => {
  try {
    const { title, description, content, course_id, duration, order_number, status } = req.body

    const pool = await sql.connect(connectionString)

    // First check if module exists and belongs to this mentor
    const checkResult = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT mentor_id FROM Modules WHERE id = @id')

    if (checkResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Module not found' })
    }

    if (checkResult.recordset[0].mentor_id !== req.user.userId) {
      return res.status(403).json({ message: 'You can only update your own modules' })
    }

    // Update the module
    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .input('title', sql.NVarChar, title)
      .input('description', sql.NVarChar, description || null)
      .input('content', sql.NVarChar, content || null)
      .input('course_id', sql.Int, course_id || null)
      .input('duration', sql.Int, duration || null)
      .input('order_number', sql.Int, order_number || null)
      .input('status', sql.NVarChar, status || null)
      .query(`
        UPDATE Modules
        SET title = COALESCE(@title, title),
            description = @description,
            content = @content,
            course_id = @course_id,
            duration = @duration,
            order_number = COALESCE(@order_number, order_number),
            status = COALESCE(@status, status),
            updated_at = GETDATE()
        OUTPUT INSERTED.*
        WHERE id = @id
      `)

    res.json(result.recordset[0])
  } catch (error) {
    console.error('Update module error:', error)
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Delete module (Mentor only - can only delete their own)
router.delete('/:id', authenticate, authorize('Mentor'), async (req, res) => {
  try {
    const pool = await sql.connect(connectionString)

    // First check if module exists and belongs to this mentor
    const checkResult = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT mentor_id FROM Modules WHERE id = @id')

    if (checkResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Module not found' })
    }

    if (checkResult.recordset[0].mentor_id !== req.user.userId) {
      return res.status(403).json({ message: 'You can only delete your own modules' })
    }

    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM Modules WHERE id = @id')

    res.json({ message: 'Module deleted successfully' })
  } catch (error) {
    console.error('Delete module error:', error)
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

module.exports = router
