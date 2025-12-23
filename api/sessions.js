// Sessions API endpoints (Admin only)

const express = require('express')
const sql = require('mssql')
const { authenticate, authorize } = require('../middleware/auth')

const router = express.Router()

// Get connection string
const connectionString = process.env.AZURE_SQL_CONNECTION_STRING || 
  'Server=tcp:lmsstorage.database.windows.net,1433;Initial Catalog=sessionslms;Persist Security Info=False;User ID=lmsadmin;Password=Lms@2025;MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;'

// Get all sessions (Admin only)
router.get('/', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const pool = await sql.connect(connectionString)
    
    // Try with JOINs first, fallback to simple query if tables don't exist
    let result
    try {
      result = await pool.request().query(`
        SELECT s.*, 
               u.name as tutor_name, 
               b.name as batch_name
        FROM Sessions s
        LEFT JOIN Users u ON s.tutor_id = u.id
        LEFT JOIN Batches b ON s.batch_id = b.id
        ORDER BY s.date DESC
      `)
    } catch (joinError) {
      // If JOIN fails (tables don't exist), use simple query
      console.log('JOIN failed, using simple query:', joinError.message)
      result = await pool.request().query(`
        SELECT s.*
        FROM Sessions s
        ORDER BY s.date DESC
      `)
    }

    res.json(result.recordset)
  } catch (error) {
    console.error('Get sessions error:', error)
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Get single session
router.get('/:id', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const pool = await sql.connect(connectionString)
    
    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT s.*, u.name as tutor_name, b.name as batch_name
        FROM Sessions s
        LEFT JOIN Users u ON s.tutor_id = u.id
        LEFT JOIN Batches b ON s.batch_id = b.id
        WHERE s.id = @id
      `)

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Session not found' })
    }

    res.json(result.recordset[0])
  } catch (error) {
    console.error('Get session error:', error)
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Create session (Admin only)
router.post('/', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const { title, description, tutor_id, batch_id, date, time, duration, status, meeting_link } = req.body

    if (!title || !date) {
      return res.status(400).json({ message: 'Title and date are required' })
    }

    const pool = await sql.connect(connectionString)

    // Parse date - handle both date string and datetime string
    let sessionDate
    if (typeof date === 'string' && date.includes('T')) {
      sessionDate = new Date(date)
    } else if (typeof date === 'string') {
      // If just date, combine with time
      const timeStr = time || '00:00:00'
      sessionDate = new Date(`${date}T${timeStr}`)
    } else {
      sessionDate = new Date(date)
    }

    console.log('Creating session:', { title, date: sessionDate, created_by: req.user.userId })

    // First, verify the user exists in sessionslms database
    const userCheck = await pool
      .request()
      .input('userId', sql.Int, req.user.userId)
      .query('SELECT id FROM Users WHERE id = @userId')

    if (userCheck.recordset.length === 0) {
      console.error(`User ID ${req.user.userId} not found in sessionslms database`)
      return res.status(400).json({ 
        message: `User ID ${req.user.userId} not found in database. Please login again or ensure your user exists in sessionslms database.`,
        error: 'User not found'
      })
    }

    const result = await pool
      .request()
      .input('title', sql.NVarChar, title)
      .input('description', sql.NVarChar, description || null)
      .input('tutor_id', sql.Int, tutor_id || null)
      .input('batch_id', sql.Int, batch_id || null)
      .input('date', sql.DateTime2, sessionDate)
      .input('time', sql.NVarChar, time || null)
      .input('duration', sql.Int, duration || 60)
      .input('status', sql.NVarChar, status || 'Upcoming')
      .input('meeting_link', sql.NVarChar, meeting_link || null)
      .input('created_by', sql.Int, req.user.userId)
      .query(`
        INSERT INTO Sessions (title, description, tutor_id, batch_id, date, time, duration, status, meeting_link, created_by)
        OUTPUT INSERTED.id, INSERTED.title, INSERTED.description, INSERTED.tutor_id, INSERTED.batch_id, INSERTED.date, INSERTED.time, INSERTED.duration, INSERTED.status, INSERTED.meeting_link, INSERTED.created_by, INSERTED.created_at, INSERTED.updated_at
        VALUES (@title, @description, @tutor_id, @batch_id, @date, @time, @duration, @status, @meeting_link, @created_by)
      `)

    console.log('Session created successfully:', result.recordset[0])
    res.status(201).json(result.recordset[0])
  } catch (error) {
    console.error('Create session error:', error)
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      number: error.number,
      originalError: error.originalError?.message
    })
    
    // Provide more specific error messages
    let errorMessage = 'Server error'
    if (error.message.includes('FOREIGN KEY')) {
      if (error.message.includes('created_by') || error.message.includes('Users')) {
        errorMessage = 'Invalid user. Please login again.'
      } else if (error.message.includes('batch_id') || error.message.includes('Batches')) {
        errorMessage = 'Invalid batch ID. Leave it empty if no batch is assigned.'
      } else if (error.message.includes('tutor_id') || error.message.includes('Users')) {
        errorMessage = 'Invalid tutor ID. Leave it empty if no tutor is assigned.'
      } else {
        errorMessage = 'Database constraint error: ' + error.message
      }
    } else if (error.message.includes('Cannot insert')) {
      errorMessage = 'Database error: ' + error.message
    } else {
      errorMessage = error.message || 'Failed to create session'
    }
    
    res.status(500).json({ 
      message: errorMessage,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
})

// Update session (Admin only)
router.put('/:id', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const { title, description, tutor_id, batch_id, date, time, duration, status, meeting_link } = req.body

    const pool = await sql.connect(connectionString)

    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .input('title', sql.NVarChar, title)
      .input('description', sql.NVarChar, description || null)
      .input('tutor_id', sql.Int, tutor_id || null)
      .input('batch_id', sql.Int, batch_id || null)
      .input('date', sql.DateTime2, date ? new Date(date) : null)
      .input('time', sql.NVarChar, time || null)
      .input('duration', sql.Int, duration || null)
      .input('status', sql.NVarChar, status || null)
      .input('meeting_link', sql.NVarChar, meeting_link || null)
      .query(`
        UPDATE Sessions
        SET title = @title,
            description = @description,
            tutor_id = @tutor_id,
            batch_id = @batch_id,
            date = COALESCE(@date, date),
            time = @time,
            duration = COALESCE(@duration, duration),
            status = COALESCE(@status, status),
            meeting_link = @meeting_link,
            updated_at = GETDATE()
        OUTPUT INSERTED.*
        WHERE id = @id
      `)

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Session not found' })
    }

    res.json(result.recordset[0])
  } catch (error) {
    console.error('Update session error:', error)
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Delete session (Admin only)
router.delete('/:id', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const pool = await sql.connect(connectionString)

    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM Sessions WHERE id = @id')

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Session not found' })
    }

    res.json({ message: 'Session deleted successfully' })
  } catch (error) {
    console.error('Delete session error:', error)
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

module.exports = router
