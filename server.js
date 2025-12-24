// Simple Express server alternative to Azure Functions
// Run with: node server.js

const express = require("express");
const sql = require("mssql");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
// CORS configuration - allow frontend domains
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  process.env.FRONTEND_URL,
  "https://lms-frontend.azurestaticapps.net",
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      // For development, allow all origins
      if (process.env.NODE_ENV !== "production") {
        return callback(null, true);
      }

      // In production, check if origin is allowed
      const isAllowed = allowedOrigins.some((allowed) => {
        if (!allowed) return false;
        const allowedDomain = allowed
          .replace("https://", "")
          .replace("http://", "");
        return origin.includes(allowedDomain);
      });

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);
app.use(express.json());

const { getPool } = require('./db/pool');

const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";

// Login endpoint
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ message: "Username and password are required" });
    }

    console.log("Login attempt for:", username);

    // Get connection pool
    const dbPool = await getPool();

    // Find user
    let result;
    try {
      result = await dbPool
        .request()
        .input("username", sql.NVarChar, username)
        .query(
          `SELECT id, username, email, password, name, role 
           FROM Users 
           WHERE username = @username OR email = @username`
        );
    } catch (queryError) {
      console.error("SQL query error:", queryError.message);
      // Check if Users table exists
      if (
        queryError.message.includes("Invalid object name") ||
        queryError.message.includes("Users")
      ) {
        return res.status(500).json({
          message:
            "Users table not found. Please create the Users table in your database.",
          error: queryError.message,
        });
      }
      return res.status(500).json({
        message: "Database query failed.",
        error: queryError.message,
      });
    }

    if (result.recordset.length === 0) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const user = result.recordset[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, {
      expiresIn: "7d",
    });

    // Return user data (without password)
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      user: userWithoutPassword,
      token,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
});

// Register endpoint
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password, name, role = "Student" } = req.body;

    if (!username || !email || !password || !name) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    // Get connection pool
    const dbPool = await getPool();

    // Check if user already exists
    const checkUser = await dbPool
      .request()
      .input("username", sql.NVarChar, username)
      .input("email", sql.NVarChar, email)
      .query(
        `SELECT id FROM Users 
         WHERE username = @username OR email = @email`
      );

    if (checkUser.recordset.length > 0) {
      return res
        .status(409)
        .json({ message: "Username or email already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new user
    const insertResult = await dbPool
      .request()
      .input("username", sql.NVarChar, username)
      .input("email", sql.NVarChar, email)
      .input("password", sql.NVarChar, hashedPassword)
      .input("name", sql.NVarChar, name)
      .input("role", sql.NVarChar, role)
      .query(
        `INSERT INTO Users (username, email, password, name, role)
         OUTPUT INSERTED.id, INSERTED.username, INSERTED.email, INSERTED.name, INSERTED.role
         VALUES (@username, @email, @password, @name, @role)`
      );

    const newUser = insertResult.recordset[0];

    // Generate JWT token
    const token = jwt.sign(
      { userId: newUser.id, role: newUser.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      user: newUser,
      token,
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ 
      message: "Server error. Please try again later.",
      error: error.message 
    });
  }
});

// Verify token endpoint
app.get("/api/auth/verify", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, JWT_SECRET);

    res.json({ valid: true, userId: decoded.userId, role: decoded.role });
  } catch (error) {
    res.status(401).json({ message: "Invalid or expired token" });
  }
});

// Import API routes
const sessionsRouter = require("./api/sessions");
const batchesRouter = require("./api/batches");
const modulesRouter = require("./api/modules");
const categoriesRouter = require("./api/categories");
const subcategoriesRouter = require("./api/subcategories");
const subjectsRouter = require("./api/subjects");
const topicsRouter = require("./api/topics");
const coursesRouter = require("./api/courses");

// Mount API routes
app.use("/api/sessions", sessionsRouter);
app.use("/api/batches", batchesRouter);
app.use("/api/modules", modulesRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/subcategories", subcategoriesRouter);
app.use("/api/subjects", subjectsRouter);
app.use("/api/topics", topicsRouter);
app.use("/api/courses", coursesRouter);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 API endpoints:`);
  console.log(`   Auth:`);
  console.log(`     POST http://localhost:${PORT}/api/auth/login`);
  console.log(`     POST http://localhost:${PORT}/api/auth/register`);
  console.log(`     GET  http://localhost:${PORT}/api/auth/verify`);
  console.log(`   Sessions (Admin only):`);
  console.log(`     GET    http://localhost:${PORT}/api/sessions`);
  console.log(`     POST   http://localhost:${PORT}/api/sessions`);
  console.log(`     PUT    http://localhost:${PORT}/api/sessions/:id`);
  console.log(`     DELETE http://localhost:${PORT}/api/sessions/:id`);
  console.log(`   Batches (Admin only):`);
  console.log(`     GET    http://localhost:${PORT}/api/batches`);
  console.log(`     POST   http://localhost:${PORT}/api/batches`);
  console.log(`     PUT    http://localhost:${PORT}/api/batches/:id`);
  console.log(`     DELETE http://localhost:${PORT}/api/batches/:id`);
  console.log(`   Modules (Mentor only):`);
  console.log(`     GET    http://localhost:${PORT}/api/modules`);
  console.log(`     POST   http://localhost:${PORT}/api/modules`);
  console.log(`     PUT    http://localhost:${PORT}/api/modules/:id`);
  console.log(`     DELETE http://localhost:${PORT}/api/modules/:id`);
  console.log(`   Categories (Admin only):`);
  console.log(`     GET    http://localhost:${PORT}/api/categories`);
  console.log(`     POST   http://localhost:${PORT}/api/categories`);
  console.log(`     PUT    http://localhost:${PORT}/api/categories/:id`);
  console.log(`     DELETE http://localhost:${PORT}/api/categories/:id`);
  console.log(`   SubCategories (Admin only):`);
  console.log(`     GET    http://localhost:${PORT}/api/subcategories`);
  console.log(`     POST   http://localhost:${PORT}/api/subcategories`);
  console.log(`     PUT    http://localhost:${PORT}/api/subcategories/:id`);
  console.log(`     DELETE http://localhost:${PORT}/api/subcategories/:id`);
  console.log(`   Subjects (Admin only):`);
  console.log(`     GET    http://localhost:${PORT}/api/subjects`);
  console.log(`     POST   http://localhost:${PORT}/api/subjects`);
  console.log(`     PUT    http://localhost:${PORT}/api/subjects/:id`);
  console.log(`     DELETE http://localhost:${PORT}/api/subjects/:id`);
  console.log(`   Topics (Admin only):`);
  console.log(`     GET    http://localhost:${PORT}/api/topics`);
  console.log(`     POST   http://localhost:${PORT}/api/topics`);
  console.log(`     PUT    http://localhost:${PORT}/api/topics/:id`);
  console.log(`     DELETE http://localhost:${PORT}/api/topics/:id`);
  console.log(`   Courses (Tutors & Admins):`);
  console.log(`     GET    http://localhost:${PORT}/api/courses`);
  console.log(`     POST   http://localhost:${PORT}/api/courses`);
  console.log(`     PUT    http://localhost:${PORT}/api/courses/:id`);
  console.log(`     DELETE http://localhost:${PORT}/api/courses/:id`);
});
