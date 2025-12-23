# LMS Backend

Express.js API server for the LMS application.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   - Edit `.env` file with your database connection and settings

3. **Start server:**
   ```bash
   npm start
   ```

Server runs on: `http://localhost:7071`

## Environment Variables

Edit `.env` file:
- `AZURE_SQL_CONNECTION_STRING` - Database connection string
- `JWT_SECRET` - Secret key for JWT tokens
- `PORT` - Server port (default: 7071)
- `FRONTEND_URL` - Frontend URL for CORS

## API Endpoints

- `/api/auth/login` - User login
- `/api/auth/register` - User registration
- `/api/auth/verify` - Verify token
- `/api/sessions` - Sessions management
- `/api/batches` - Batches management
- `/api/modules` - Modules management
- `/api/categories` - Categories management
- `/api/courses` - Courses management
