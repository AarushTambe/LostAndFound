
import { Router } from "express";
import { pool } from "../config/db";
import {
  authenticateToken,
  type AuthRequest,
} from "../middleware/auth";

const router = Router();

const validTypes = ["lost", "found"];
const validStatuses = ["open", "claimed", "resolved"];

function isValidId(id: unknown): id is string {
  if (typeof id !== "string" || !/^\d+$/.test(id)) return false;

  try {
    return BigInt(id) > 0n;
  } catch {
    return false;
  }
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

// GET /api/items
// Public announcement board with search and filters.
router.get("/", async (req, res) => {
  try {
    const { q, type, category, status } = req.query;
    const values: unknown[] = [];
    const conditions: string[] = [];

    if (type !== undefined) {
      if (typeof type !== "string" || !validTypes.includes(type)) {
        res.status(400).json({ error: "Invalid item type" });
        return;
      }
      values.push(type);
      conditions.push(`i.type = $${values.length}`);
    }

    if (category !== undefined) {
      if (typeof category !== "string" || category.length > 60) {
        res.status(400).json({ error: "Invalid category" });
        return;
      }
      values.push(category);
      conditions.push(`i.category = $${values.length}`);
    }

    if (status !== undefined && status !== "all") {
      if (typeof status !== "string" || !validStatuses.includes(status)) {
        res.status(400).json({ error: "Invalid item status" });
        return;
      }
      values.push(status);
      conditions.push(`i.status = $${values.length}`);
    } else if (status !== "all") {
      conditions.push("i.status IN ('open', 'claimed')");
    }

    if (q !== undefined) {
      if (typeof q !== "string" || q.trim().length > 100) {
        res.status(400).json({ error: "Invalid search query" });
        return;
      }
      values.push(`%${q.trim()}%`);
      const p = `$${values.length}`;
      conditions.push(
        `(i.title ILIKE ${p} OR i.description ILIKE ${p} OR i.location ILIKE ${p})`
      );
    }

    const where = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const result = await pool.query(
      `SELECT
         i.id, i.user_id, i.type, i.title, i.description,
         i.category, i.location, i.item_date, i.image_url,
         i.status, i.custody_status, i.matched_item_id,
         i.created_at, i.updated_at,
         u.name AS reporter_name
       FROM items i
       JOIN users u ON u.id = i.user_id
       ${where}
       ORDER BY i.created_at DESC
       LIMIT 100`,
      values
    );

    res.json({ items: result.rows });
  } catch (error) {
    console.error("Item listing failed:", error);
    res.status(500).json({ error: "Unable to retrieve items" });
  }
});

// PATCH /api/items/:id/receive
// Authorized staff confirm physical receipt at the central desk.
router.patch("/:id/receive", authenticateToken, async (req, res) => {
  const authReq = req as AuthRequest;
  const id = req.params.id;

  if (!isValidId(id)) {
    res.status(400).json({ error: "Invalid item ID" });
    return;
  }

  if (authReq.user!.role !== "admin") {
    res.status(403).json({ error: "Only authorized desk staff can confirm receipt" });
    return;
  }

  try {
    const result = await pool.query(
      `UPDATE items
       SET custody_status = 'in_custody', updated_at = NOW()
       WHERE id = $1
         AND type = 'found'
         AND status = 'open'
         AND custody_status = 'pending_handover'
       RETURNING id, title, type, status, custody_status`,
      [id]
    );

    if (result.rowCount === 0) {
      const existing = await pool.query(
        "SELECT id, type, status, custody_status FROM items WHERE id = $1",
        [id]
      );

      if (existing.rowCount === 0) {
        res.status(404).json({ error: "Item not found" });
      } else {
        res.status(409).json({
          error: "Item is not awaiting desk receipt",
          item: existing.rows[0],
        });
      }
      return;
    }

    res.json({
      message: "Physical receipt confirmed",
      item: result.rows[0],
    });
  } catch (error) {
    console.error("Receipt confirmation failed:", error);
    res.status(500).json({ error: "Unable to confirm physical receipt" });
  }
});

// PATCH /api/items/:id/match
// Staff link a lost announcement to its corresponding found report.
router.patch("/:id/match", authenticateToken, async (req, res) => {
  const authReq = req as AuthRequest;
  const lostId = req.params.id;
  const foundId = req.body?.found_item_id;

  if (!isValidId(lostId) || !isValidId(foundId)) {
    res.status(400).json({ error: "Valid lost and found item IDs are required" });
    return;
  }

  if (lostId === foundId) {
    res.status(400).json({ error: "An item cannot match itself" });
    return;
  }

  if (authReq.user!.role !== "admin") {
    res.status(403).json({ error: "Only authorized desk staff can match reports" });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const ids = [lostId, foundId].sort((a, b) =>
      BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0
    );

    const locked = await client.query(
      `SELECT id, type, status, custody_status, matched_item_id
       FROM items
       WHERE id = ANY($1::bigint[])
       ORDER BY id
       FOR UPDATE`,
      [ids]
    );

    if (locked.rowCount !== 2) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Lost or found report not found" });
      return;
    }

    const lost = locked.rows.find((item) => String(item.id) === lostId);
    const found = locked.rows.find((item) => String(item.id) === foundId);

    if (
      !lost ||
      !found ||
      lost.type !== "lost" ||
      found.type !== "found" ||
      lost.status !== "open" ||
      found.status !== "open" ||
      found.custody_status !== "in_custody" ||
      lost.matched_item_id !== null ||
      found.matched_item_id !== null
    ) {
      await client.query("ROLLBACK");
      res.status(409).json({
        error: "Reports must be open, unmatched, and the found item must be in custody",
      });
      return;
    }

    await client.query(
      `UPDATE items
       SET matched_item_id = $1, updated_at = NOW()
       WHERE id = $2`,
      [foundId, lostId]
    );

    await client.query(
      `UPDATE items
       SET matched_item_id = $1, updated_at = NOW()
       WHERE id = $2`,
      [lostId, foundId]
    );

    await client.query("COMMIT");

    res.json({
      message: "Lost and found reports linked successfully",
      lost_item_id: lostId,
      found_item_id: foundId,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Item matching failed:", error);
    res.status(500).json({ error: "Unable to match reports" });
  } finally {
    client.release();
  }
});

// GET /api/items/:id
router.get("/:id", async (req, res) => {
  const id = req.params.id;

  if (!isValidId(id)) {
    res.status(400).json({ error: "Invalid item ID" });
    return;
  }

  try {
    const result = await pool.query(
      `SELECT
         i.id, i.user_id, i.type, i.title, i.description,
         i.category, i.location, i.item_date, i.image_url,
         i.status, i.custody_status, i.matched_item_id,
         i.created_at, i.updated_at,
         u.name AS reporter_name
       FROM items i
       JOIN users u ON u.id = i.user_id
       WHERE i.id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    res.json({ item: result.rows[0] });
  } catch (error) {
    console.error("Item lookup failed:", error);
    res.status(500).json({ error: "Unable to retrieve item" });
  }
});

// POST /api/items
router.post("/", authenticateToken, async (req, res) => {
  const authReq = req as AuthRequest;
  const { type, title, description, category, location, item_date, image_url } =
    req.body;

  if (typeof type !== "string" || !validTypes.includes(type)) {
    res.status(400).json({ error: "Type must be lost or found" });
    return;
  }

  const fields = [
    ["title", title, 150],
    ["description", description, 5000],
    ["category", category, 60],
    ["location", location, 200],
  ] as const;

  for (const [name, value, maxLength] of fields) {
    if (
      typeof value !== "string" ||
      !value.trim() ||
      value.trim().length > maxLength
    ) {
      res.status(400).json({
        error: `${name} is required and must be at most ${maxLength} characters`,
      });
      return;
    }
  }

  if (!isValidDate(item_date)) {
    res.status(400).json({ error: "Provide a valid item_date in YYYY-MM-DD format" });
    return;
  }

  if (
    image_url !== undefined &&
    image_url !== null &&
    (typeof image_url !== "string" || image_url.length > 2000)
  ) {
    res.status(400).json({ error: "Invalid image URL" });
    return;
  }

  try {
    const custodyStatus =
      type === "found" ? "pending_handover" : "not_applicable";

    const result = await pool.query(
      `INSERT INTO items
         (user_id, type, title, description, category, location,
          item_date, image_url, custody_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        authReq.user!.id,
        type,
        title.trim(),
        description.trim(),
        category.trim(),
        location.trim(),
        item_date,
        typeof image_url === "string" ? image_url.trim() || null : null,
        custodyStatus,
      ]
    );

    res.status(201).json({
      message: "Item report created successfully",
      item: result.rows[0],
    });
  } catch (error) {
    console.error("Item creation failed:", error);
    res.status(500).json({ error: "Unable to create item report" });
  }
});

// PATCH /api/items/:id
// Owners may edit details of their own open reports only.
router.patch("/:id", authenticateToken, async (req, res) => {
  const authReq = req as AuthRequest;
  const id = req.params.id;

  if (!isValidId(id)) {
    res.status(400).json({ error: "Invalid item ID" });
    return;
  }

  const allowedFields = [
    "title",
    "description",
    "category",
    "location",
    "item_date",
    "image_url",
  ] as const;

  const maxLengths: Record<string, number> = {
    title: 150,
    description: 5000,
    category: 60,
    location: 200,
  };

  const updates: { field: string; value: unknown }[] = [];

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates.push({ field, value: req.body[field] });
    }
  }

  if (updates.length === 0) {
    res.status(400).json({ error: "Provide at least one editable field" });
    return;
  }

  for (const update of updates) {
    const { field, value } = update;

    if (field === "image_url") {
      if (value !== null && (typeof value !== "string" || value.length > 2000)) {
        res.status(400).json({ error: "Invalid image URL" });
        return;
      }
    } else if (field === "item_date") {
      if (!isValidDate(value)) {
        res.status(400).json({ error: "Invalid item date" });
        return;
      }
    } else {
      if (
        typeof value !== "string" ||
        !value.trim() ||
        value.trim().length > maxLengths[field]
      ) {
        res.status(400).json({ error: `Invalid ${field}` });
        return;
      }

      update.value = value.trim();
    }
  }

  try {
    const values: unknown[] = [];
    const assignments = updates.map(({ field, value }) => {
      values.push(value);
      return `${field} = $${values.length}`;
    });

    assignments.push("updated_at = NOW()");
    values.push(id, authReq.user!.id);

    const result = await pool.query(
      `UPDATE items
       SET ${assignments.join(", ")}
       WHERE id = $${values.length - 1}
         AND user_id = $${values.length}
         AND status = 'open'
       RETURNING *`,
      values
    );

    if (result.rowCount === 0) {
      const existing = await pool.query(
        "SELECT user_id, status FROM items WHERE id = $1",
        [id]
      );

      if (existing.rowCount === 0) {
        res.status(404).json({ error: "Item not found" });
      } else if (String(existing.rows[0].user_id) !== authReq.user!.id) {
        res.status(403).json({ error: "You cannot edit another user's report" });
      } else {
        res.status(409).json({ error: "Only open reports can be edited" });
      }
      return;
    }

    res.json({
      message: "Item report updated successfully",
      item: result.rows[0],
    });
  } catch (error) {
    console.error("Item update failed:", error);
    res.status(500).json({ error: "Unable to update item report" });
  }
});

export default router;
