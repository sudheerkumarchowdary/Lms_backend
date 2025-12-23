// Batches API endpoints (Admin only)

const express = require('express')
const sql = require('mssql')
const { authenticate, authorize } = require('../middleware/auth')

const router = express.Router()

// Get connection string
const connectionString = process.env.AZURE_SQL_CONNECTION_STRING || 
  'Server=tcp:lmsstorage.database.windows.net,1433;Initial Catalog=sessionslms;Persist Security Info=False;User ID=lmsadmin;Password=Lms@2025;MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;'

// Get all batches (Admin only)
router.get('/', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const pool = await sql.connect(connectionString)
    
    const result = await pool.request().query(`
      SELECT b.*, u.name as created_by_name,
             (SELECT COUNT(*) FROM BatchEnrollments WHERE batch_id = b.id AND status = 'Active') as enrolled_count
      FROM Batches b
      LEFT JOIN Users u ON b.created_by = u.id
      ORDER BY b.start_date DESC
    `)

    res.json(result.recordset)
  } catch (error) {
    console.error('Get batches error:', error)
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Get single batch
router.get('/:id', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const pool = await sql.connect(connectionString)
    
    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT b.*, u.name as created_by_name
        FROM Batches b
        LEFT JOIN Users u ON b.created_by = u.id
        WHERE b.id = @id
      `)

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Batch not found' })
    }

    res.json(result.recordset[0])
  } catch (error) {
    console.error('Get batch error:', error)
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Create batch (Admin only)
router.post('/', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const { name, description, start_date, end_date, capacity, status } = req.body

    if (!name || !start_date) {
      return res.status(400).json({ message: 'Name and start date are required' })
    }

    const pool = await sql.connect(connectionString)

    const result = await pool
      .request()
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || null)
      .input('start_date', sql.Date, new Date(start_date))
      .input('end_date', sql.Date, end_date ? new Date(end_date) : null)
      .input('capacity', sql.Int, capacity || 50)
      .input('status', sql.NVarChar, status || 'Active')
      .input('created_by', sql.Int, req.user.userId)
      .query(`
        INSERT INTO Batches (name, description, start_date, end_date, capacity, status, created_by)
        OUTPUT INSERTED.*
        VALUES (@name, @description, @start_date, @end_date, @capacity, @status, @created_by)
      `)

    res.status(201).json(result.recordset[0])
  } catch (error) {
    console.error('Create batch error:', error)
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Update batch (Admin only)
router.put('/:id', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const { name, description, start_date, end_date, capacity, status } = req.body

    const pool = await sql.connect(connectionString)

    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || null)
      .input('start_date', sql.Date, start_date ? new Date(start_date) : null)
      .input('end_date', sql.Date, end_date ? new Date(end_date) : null)
      .input('capacity', sql.Int, capacity || null)
      .input('status', sql.NVarChar, status || null)
      .query(`
        UPDATE Batches
        SET name = @name,
            description = @description,
            start_date = COALESCE(@start_date, start_date),
            end_date = @end_date,
            capacity = COALESCE(@capacity, capacity),
            status = COALESCE(@status, status),
            updated_at = GETDATE()
        OUTPUT INSERTED.*
        WHERE id = @id
      `)

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Batch not found' })
    }

    res.json(result.recordset[0])
  } catch (error) {
    console.error('Update batch error:', error)
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Delete batch (Admin only)
router.delete('/:id', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const pool = await sql.connect(connectionString)

    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM Batches WHERE id = @id')

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Batch not found' })
    }

    res.json({ message: 'Batch deleted successfully' })
  } catch (error) {
    console.error('Delete batch error:', error)
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

module.exports = router
