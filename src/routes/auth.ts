
import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../config/db";
import {
  authenticateToken,
  type AuthRequest,
} from "../middleware/auth";

const router = Router();

function createToken(id: string, role: "user" | "admin") {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign({ id, role }, secret, { expiresIn: "2h" });
}

router.post("/register", async (req, res) => {
  try {
    const name = typeof req.body.name === "string"
      ? req.body.name.trim()
      : "";
    const email = typeof req.body.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";
    const password = typeof req.body.password === "string"
      ? req.body.password
      : "";

    if (!name || name.length > 100) {
      res.status(400).json({ error: "Name is required (maximum 100 characters)" });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
      res.status(400).json({ error: "Enter a valid email address" });
      return;
    }

    if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
      res.status(400).json({
        error: "Password must be at least 8 characters and at most 72 bytes",
      });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, role`,
      [name, email, passwordHash]
    );

    const user = result.rows[0];
    const token = createToken(String(user.id), user.role);

    res.status(201).json({
      message: "Registration successful",
      token,
      user,
    });
  } catch (error: unknown) {
    const dbError = error as { code?: string };

    if (dbError.code === "23505") {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }

    console.error("Registration failed:", error);
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const email = typeof req.body.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";
    const password = typeof req.body.password === "string"
      ? req.body.password
      : "";

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const result = await pool.query(
      `SELECT id, name, email, password_hash, role
       FROM users
       WHERE email = $1`,
      [email]
    );

    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const token = createToken(String(user.id), user.role);

    res.json({
      message: "Login successful",
      token,
      user: {
        id: String(user.id),
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login failed:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/me", authenticateToken, async (req, res) => {
  const authReq = req as AuthRequest;

  try {
    const result = await pool.query(
      `SELECT id, name, email, role, created_at
       FROM users
       WHERE id = $1`,
      [authReq.user!.id]
    );

    if (result.rowCount === 0) {
      res.status(401).json({ error: "User account no longer exists" });
      return;
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error("Profile lookup failed:", error);
    res.status(500).json({ error: "Unable to retrieve profile" });
  }
});

export default router;
