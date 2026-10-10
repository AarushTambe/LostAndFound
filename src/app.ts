import authRoutes from "./routes/auth";
import express from "express";
import { pool } from "./config/db";
import itemRoutes from "./routes/items";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/items", itemRoutes);

// Authentication routes
app.use("/api/auth", authRoutes);

app.get("/api/health", async (_req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS database_time");

    res.json({
      status: "ok",
      message: "Lost & Found API is running",
      database: "connected",
      databaseTime: result.rows[0].database_time,
    });
  } catch (error) {
    console.error("Health check failed:", error);
    res.status(503).json({
      status: "error",
      message: "Database connection failed",
    });
  }
});

export default app;
