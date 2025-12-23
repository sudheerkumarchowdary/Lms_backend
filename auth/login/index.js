// Azure Function for user login
// This connects to your Azure SQL Database

const sql = require('mssql')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

module.exports = async function (context, req) {
  context.log('Login function processed a request.')

  const { username, password } = req.body

  // Validate input
  if (!username || !password) {
    context.res = {
      status: 400,
      body: { message: 'Username and password are required' },
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

    // Find user by username or email
    const result = await pool
      .request()
      .input('username', sql.NVarChar, username)
      .query(
        `SELECT id, username, email, password, name, role 
         FROM Users 
         WHERE username = @username OR email = @username`
      )

    if (result.recordset.length === 0) {
      context.res = {
        status: 401,
        body: { message: 'Invalid username or password' },
      }
      return
    }

    const user = result.recordset[0]

    // Verify password (assuming passwords are hashed with bcrypt)
    const isValidPassword = await bcrypt.compare(password, user.password)

    if (!isValidPassword) {
      context.res = {
        status: 401,
        body: { message: 'Invalid username or password' },
      }
      return
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      { expiresIn: '7d' }
    )

    // Return user data (without password)
    const { password: _, ...userWithoutPassword } = user

    context.res = {
      status: 200,
      body: {
        user: userWithoutPassword,
        token,
      },
    }
  } catch (error) {
    context.log.error('Login error:', error)
    context.res = {
      status: 500,
      body: { message: 'Server error. Please try again later.' },
    }
  }
}
