// SubCategories API endpoints (Admin only)

const express = require('express')
const sql = require('mssql')
const { authenticate, authorize } = require('../middleware/auth')
const { getPool } = require('../db/pool')

const router = express.Router()

// Get all subcategories (optionally filtered by category_id)
router.get('/', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const { category_id } = req.query
    const pool = await getPool()
    
    let query = `
      SELECT sc.*, 
             c.name as category_name,
             u.name as created_by_name,
             (SELECT COUNT(*) FROM Subjects WHERE sub_category_id = sc.id AND status = 'Active') as subjects_count,
             (SELECT COUNT(*) FROM Topics t
              INNER JOIN Subjects s ON t.subject_id = s.id
              WHERE s.sub_category_id = sc.id AND t.status = 'Active') as topics_count
      FROM SubCategories sc
      LEFT JOIN Categories c ON sc.category_id = c.id
      LEFT JOIN Users u ON sc.created_by = u.id
    `
    
    if (category_id) {
      query += ` WHERE sc.category_id = ${parseInt(category_id)}`
    }
    
    query += ` ORDER BY sc.name ASC`
    
    const result = await pool.request().query(query)
    res.json(result.recordset)
  } catch (error) {
    console.error('Get subcategories error:', error)
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Get single subcategory
router.get('/:id', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const pool = await getPool()
    
    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT sc.*, c.name as category_name, u.name as created_by_name
        FROM SubCategories sc
        LEFT JOIN Categories c ON sc.category_id = c.id
        LEFT JOIN Users u ON sc.created_by = u.id
        WHERE sc.id = @id
      `)

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'SubCategory not found' })
    }

    res.json(result.recordset[0])
  } catch (error) {
    console.error('Get subcategory error:', error)
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Create subcategory (Admin only)
router.post('/', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const { name, description, category_id, status } = req.body

    if (!name || !category_id) {
      return res.status(400).json({ message: 'Name and category_id are required' })
    }

    const pool = await getPool()

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

    const result = await pool
      .request()
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || null)
      .input('category_id', sql.Int, category_id)
      .input('status', sql.NVarChar, status || 'Active')
      .input('created_by', sql.Int, req.user.userId)
      .query(`
        INSERT INTO SubCategories (name, description, category_id, status, created_by)
        OUTPUT INSERTED.id, INSERTED.name, INSERTED.description, INSERTED.category_id, INSERTED.status, INSERTED.created_by, INSERTED.created_at, INSERTED.updated_at
        VALUES (@name, @description, @category_id, @status, @created_by)
      `)

    console.log('SubCategory created successfully:', result.recordset[0])
    res.status(201).json(result.recordset[0])
  } catch (error) {
    console.error('Create subcategory error:', error)
    res.status(500).json({ 
      message: error.message || 'Failed to create subcategory',
      error: error.message
    })
  }
})

// Update subcategory (Admin only)
router.put('/:id', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const { name, description, status } = req.body

    const pool = await getPool()

    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || null)
      .input('status', sql.NVarChar, status || null)
      .query(`
        UPDATE SubCategories
        SET name = @name,
            description = @description,
            status = COALESCE(@status, status),
            updated_at = GETDATE()
        OUTPUT INSERTED.*
        WHERE id = @id
      `)

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'SubCategory not found' })
    }

    res.json(result.recordset[0])
  } catch (error) {
    console.error('Update subcategory error:', error)
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Delete subcategory (Admin only)
router.delete('/:id', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const pool = await getPool()

    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM SubCategories WHERE id = @id')

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'SubCategory not found' })
    }

    res.json({ message: 'SubCategory deleted successfully' })
  } catch (error) {
    console.error('Delete subcategory error:', error)
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

module.exports = router
