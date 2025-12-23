// Azure Function for user registration
// This connects to your Azure SQL Database

const sql = require('mssql')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

module.exports = async function (context, req) {
  context.log('Register function processed a request.')

  const { username, email, password, name, role = 'Student' } = req.body

  // Validate input
  if (!username || !email || !password || !name) {
    context.res = {
      status: 400,
      body: { message: 'All fields are required' },
    }
    return
  }

  // Validate password strength
  if (password.length < 6) {
    context.res = {
      status: 400,
      body: { message: 'Password must be at least 6 characters' },
    }
    return
  }

  try {
    // Get connection string from environment variables
    const connectionString = process.env.AZURE_SQL_CONNECTION_STRING

    if (!connectionString) {
      throw new Error('Database connection string not configured')
    }

    // Connect to SQL Database
    const pool = await sql.connect(connectionString)

    // Check if user already exists
    const checkUser = await pool
      .request()
      .input('username', sql.NVarChar, username)
      .input('email', sql.NVarChar, email)
      .query(
        `SELECT id FROM Users 
         WHERE username = @username OR email = @email`
      )

    if (checkUser.recordset.length > 0) {
      context.res = {
        status: 409,
        body: { message: 'Username or email already exists' },
      }
      return
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Insert new user
    const insertResult = await pool
      .request()
      .input('username', sql.NVarChar, username)
      .input('email', sql.NVarChar, email)
      .input('password', sql.NVarChar, hashedPassword)
      .input('name', sql.NVarChar, name)
      .input('role', sql.NVarChar, role)
      .query(
        `INSERT INTO Users (username, email, password, name, role)
         OUTPUT INSERTED.id, INSERTED.username, INSERTED.email, INSERTED.name, INSERTED.role
         VALUES (@username, @email, @password, @name, @role)`
      )

    const newUser = insertResult.recordset[0]

    // Generate JWT token
    const token = jwt.sign(
      { userId: newUser.id, role: newUser.role },
      process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      { expiresIn: '7d' }
    )

    context.res = {
      status: 201,
      body: {
        user: newUser,
        token,
      },
    }
  } catch (error) {
    context.log.error('Registration error:', error)
    context.res = {
      status: 500,
      body: { message: 'Server error. Please try again later.' },
    }
  }
}
