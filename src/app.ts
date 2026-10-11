import authRoutes from "./routes/auth";
import express from "express";
import { pool } from "./config/db";
import itemRoutes from "./routes/items";
import claimsRoutes from "./routes/claims";
import type { ErrorRequestHandler } from "express";

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(express.static("public"));

app.use((req, res, next) => {
  const isWriteRequest = ["POST", "PUT", "PATCH"].includes(req.method);
  const isApiRequest = req.path.startsWith("/api/");

  if (!isWriteRequest || !isApiRequest) {
    next();
    return;
  }

  if (!req.is("application/json")) {
    res.status(415).json({
      error: "Content-Type must be application/json",
    });
    return;
  }

  if (
    !req.body ||
    typeof req.body !== "object" ||
    Array.isArray(req.body)
  ) {
    res.status(400).json({
      error: "A valid JSON object is required",
    });
    return;
  }

  next();
});

// Authentication routes
app.use("/api/auth", authRoutes);

app.use("/api/items", itemRoutes);
app.use("/api", claimsRoutes);

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

const errorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  next
) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const parsedError = error as {
    status?: number;
    type?: string;
  };

  if (parsedError.type === "entity.too.large") {
    res.status(413).json({
      error: "Request body is too large",
    });
    return;
  }

  if (
    error instanceof SyntaxError &&
    parsedError.status === 400
  ) {
    res.status(400).json({
      error: "Malformed JSON request body",
    });
    return;
  }

  console.error("Unhandled request error:", error);

  res.status(500).json({
    error: "Internal server error",
  });
};

app.use(errorHandler);

export default app;
