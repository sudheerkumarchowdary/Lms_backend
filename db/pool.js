// Shared database connection pool
const sql = require('mssql')

// Get connection string from environment or use default
const connectionString =
  process.env.AZURE_SQL_CONNECTION_STRING ||
  "Server=tcp:lmsstorage.database.windows.net,1433;Initial Catalog=sessionslms;Persist Security Info=False;User ID=lmsadmin;Password=Lms@2025;MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;";

// Global connection pool
let pool = null;

// Initialize connection pool
async function getPool() {
  if (!pool) {
    try {
      pool = await sql.connect(connectionString);
      console.log("Database connection pool created successfully");
      
      // Handle pool errors
      pool.on('error', err => {
        console.error('SQL Pool Error:', err);
        pool = null; // Reset pool on error
      });
    } catch (error) {
      console.error("Failed to create database connection pool:", error.message);
      throw error;
    }
  }
  return pool;
}

module.exports = { getPool };

