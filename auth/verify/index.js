// Azure Function to verify JWT token

const jwt = require('jsonwebtoken')

module.exports = async function (context, req) {
  context.log('Verify function processed a request.')

  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    context.res = {
      status: 401,
      body: { message: 'No token provided' },
    }
    return
  }

  const token = authHeader.split(' ')[1]

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'your-secret-key-change-in-production'
    )

    context.res = {
      status: 200,
      body: { valid: true, userId: decoded.userId, role: decoded.role },
    }
  } catch (error) {
    context.res = {
      status: 401,
      body: { message: 'Invalid or expired token' },
    }
  }
}
