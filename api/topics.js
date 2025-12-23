// Topics API endpoints (Admin only)

const express = require('express')
const sql = require('mssql')
const { authenticate, authorize } = require('../middleware/auth')

const router = express.Router()

// Get connection string
const connectionString = process.env.AZURE_SQL_CONNECTION_STRING || 
  'Server=tcp:lmsstorage.database.windows.net,1433;Initial Catalog=sessionslms;Persist Security Info=False;User ID=lmsadmin;Password=Lms@2025;MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;'

// Get all topics (optionally filtered by subject_id)
router.get('/', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const { subject_id } = req.query
    const pool = await sql.connect(connectionString)
    
    let query = `
      SELECT t.*, 
             s.name as subject_name,
             sc.name as sub_category_name,
             c.name as category_name,
             u.name as created_by_name
      FROM Topics t
      LEFT JOIN Subjects s ON t.subject_id = s.id
      LEFT JOIN SubCategories sc ON s.sub_category_id = sc.id
      LEFT JOIN Categories c ON sc.category_id = c.id
      LEFT JOIN Users u ON t.created_by = u.id
    `
    
    if (subject_id) {
      query += ` WHERE t.subject_id = ${parseInt(subject_id)}`
    }
    
    query += ` ORDER BY t.name ASC`
    
    const result = await pool.request().query(query)
    res.json(result.recordset)
  } catch (error) {
    console.error('Get topics error:', error)
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Get single topic
router.get('/:id', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const pool = await sql.connect(connectionString)
    
    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT t.*, s.name as subject_name, sc.name as sub_category_name, c.name as category_name, u.name as created_by_name
        FROM Topics t
        LEFT JOIN Subjects s ON t.subject_id = s.id
        LEFT JOIN SubCategories sc ON s.sub_category_id = sc.id
        LEFT JOIN Categories c ON sc.category_id = c.id
        LEFT JOIN Users u ON t.created_by = u.id
        WHERE t.id = @id
      `)

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Topic not found' })
    }

    res.json(result.recordset[0])
  } catch (error) {
    console.error('Get topic error:', error)
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Create topic (Admin only)
router.post('/', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const { name, description, subject_id, status } = req.body

    if (!name || !subject_id) {
      return res.status(400).json({ message: 'Name and subject_id are required' })
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

    // Verify subject exists
    const subjectCheck = await pool
      .request()
      .input('subjectId', sql.Int, subject_id)
      .query('SELECT id FROM Subjects WHERE id = @subjectId')

    if (subjectCheck.recordset.length === 0) {
      return res.status(400).json({ message: 'Subject not found' })
    }

    const result = await pool
      .request()
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || null)
      .input('subject_id', sql.Int, subject_id)
      .input('status', sql.NVarChar, status || 'Active')
      .input('created_by', sql.Int, req.user.userId)
      .query(`
        INSERT INTO Topics (name, description, subject_id, status, created_by)
        OUTPUT INSERTED.id, INSERTED.name, INSERTED.description, INSERTED.subject_id, INSERTED.status, INSERTED.created_by, INSERTED.created_at, INSERTED.updated_at
        VALUES (@name, @description, @subject_id, @status, @created_by)
      `)

    console.log('Topic created successfully:', result.recordset[0])
    res.status(201).json(result.recordset[0])
  } catch (error) {
    console.error('Create topic error:', error)
    res.status(500).json({ 
      message: error.message || 'Failed to create topic',
      error: error.message
    })
  }
})

// Update topic (Admin only)
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
        UPDATE Topics
        SET name = @name,
            description = @description,
            status = COALESCE(@status, status),
            updated_at = GETDATE()
        OUTPUT INSERTED.*
        WHERE id = @id
      `)

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Topic not found' })
    }

    res.json(result.recordset[0])
  } catch (error) {
    console.error('Update topic error:', error)
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Delete topic (Admin only)
router.delete('/:id', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const pool = await sql.connect(connectionString)

    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM Topics WHERE id = @id')

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Topic not found' })
    }

    res.json({ message: 'Topic deleted successfully' })
  } catch (error) {
    console.error('Delete topic error:', error)
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

module.exports = router
