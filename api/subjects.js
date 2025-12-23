// Subjects API endpoints (Admin only)

const express = require('express')
const sql = require('mssql')
const { authenticate, authorize } = require('../middleware/auth')

const router = express.Router()

// Get connection string
const connectionString = process.env.AZURE_SQL_CONNECTION_STRING || 
  'Server=tcp:lmsstorage.database.windows.net,1433;Initial Catalog=sessionslms;Persist Security Info=False;User ID=lmsadmin;Password=Lms@2025;MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;'

// Get all subjects (optionally filtered by sub_category_id)
router.get('/', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const { sub_category_id } = req.query
    const pool = await sql.connect(connectionString)
    
    let query = `
      SELECT s.*, 
             sc.name as sub_category_name,
             c.name as category_name,
             u.name as created_by_name,
             (SELECT COUNT(*) FROM Topics WHERE subject_id = s.id AND status = 'Active') as topics_count
      FROM Subjects s
      LEFT JOIN SubCategories sc ON s.sub_category_id = sc.id
      LEFT JOIN Categories c ON sc.category_id = c.id
      LEFT JOIN Users u ON s.created_by = u.id
    `
    
    if (sub_category_id) {
      query += ` WHERE s.sub_category_id = ${parseInt(sub_category_id)}`
    }
    
    query += ` ORDER BY s.name ASC`
    
    const result = await pool.request().query(query)
    res.json(result.recordset)
  } catch (error) {
    console.error('Get subjects error:', error)
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Get single subject
router.get('/:id', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const pool = await sql.connect(connectionString)
    
    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT s.*, sc.name as sub_category_name, c.name as category_name, u.name as created_by_name
        FROM Subjects s
        LEFT JOIN SubCategories sc ON s.sub_category_id = sc.id
        LEFT JOIN Categories c ON sc.category_id = c.id
        LEFT JOIN Users u ON s.created_by = u.id
        WHERE s.id = @id
      `)

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Subject not found' })
    }

    res.json(result.recordset[0])
  } catch (error) {
    console.error('Get subject error:', error)
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Create subject (Admin only)
router.post('/', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const { name, description, sub_category_id, status } = req.body

    if (!name || !sub_category_id) {
      return res.status(400).json({ message: 'Name and sub_category_id are required' })
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

    // Verify subcategory exists
    const subCategoryCheck = await pool
      .request()
      .input('subCategoryId', sql.Int, sub_category_id)
      .query('SELECT id FROM SubCategories WHERE id = @subCategoryId')

    if (subCategoryCheck.recordset.length === 0) {
      return res.status(400).json({ message: 'SubCategory not found' })
    }

    const result = await pool
      .request()
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || null)
      .input('sub_category_id', sql.Int, sub_category_id)
      .input('status', sql.NVarChar, status || 'Active')
      .input('created_by', sql.Int, req.user.userId)
      .query(`
        INSERT INTO Subjects (name, description, sub_category_id, status, created_by)
        OUTPUT INSERTED.id, INSERTED.name, INSERTED.description, INSERTED.sub_category_id, INSERTED.status, INSERTED.created_by, INSERTED.created_at, INSERTED.updated_at
        VALUES (@name, @description, @sub_category_id, @status, @created_by)
      `)

    console.log('Subject created successfully:', result.recordset[0])
    res.status(201).json(result.recordset[0])
  } catch (error) {
    console.error('Create subject error:', error)
    res.status(500).json({ 
      message: error.message || 'Failed to create subject',
      error: error.message
    })
  }
})

// Update subject (Admin only)
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
        UPDATE Subjects
        SET name = @name,
            description = @description,
            status = COALESCE(@status, status),
            updated_at = GETDATE()
        OUTPUT INSERTED.*
        WHERE id = @id
      `)

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Subject not found' })
    }

    res.json(result.recordset[0])
  } catch (error) {
    console.error('Update subject error:', error)
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Delete subject (Admin only)
router.delete('/:id', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const pool = await sql.connect(connectionString)

    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM Subjects WHERE id = @id')

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Subject not found' })
    }

    res.json({ message: 'Subject deleted successfully' })
  } catch (error) {
    console.error('Delete subject error:', error)
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

module.exports = router
