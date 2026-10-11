
import { Router } from "express";
import { pool } from "../config/db";
import {
  authenticateToken,
  type AuthRequest,
} from "../middleware/auth";

const router = Router();

function isValidId(id: unknown): id is string {
  if (typeof id !== "string" || !/^[1-9]\d*$/.test(id)) {
    return false;
  }

  try {
    return BigInt(id) <= 9223372036854775807n;
  } catch {
    return false;
  }
}

function isStaff(req: AuthRequest): boolean {
  return req.user?.role === "admin";
}

// POST /api/items/:id/claims
// A student submits a claim for a found item in college custody.
router.post(
  "/items/:id/claims",
  authenticateToken,
  async (req, res) => {
    const authReq = req as AuthRequest;
    const itemId = req.params.id;
    const message =
      typeof req.body.message === "string"
        ? req.body.message.trim()
        : "";

    if (!isValidId(itemId)) {
      res.status(400).json({ error: "Invalid item ID" });
      return;
    }

    if (!message || message.length > 2000) {
      res.status(400).json({
        error: "Claim message is required (maximum 2000 characters)",
      });
      return;
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const itemResult = await client.query(
        `SELECT id, user_id, type, status, custody_status
         FROM items
         WHERE id = $1
         FOR UPDATE`,
        [itemId]
      );

      if (itemResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Item not found" });
        return;
      }

      const item = itemResult.rows[0];

      if (item.type !== "found") {
        await client.query("ROLLBACK");
        res.status(400).json({
          error: "Claims can only be submitted for found items",
        });
        return;
      }

      if (String(item.user_id) === authReq.user!.id) {
        await client.query("ROLLBACK");
        res.status(403).json({
          error: "You cannot claim your own found report",
        });
        return;
      }

      if (
        item.status !== "open" ||
        item.custody_status !== "in_custody"
      ) {
        await client.query("ROLLBACK");
        res.status(409).json({
          error: "This item is not currently available for claims",
        });
        return;
      }

      const result = await client.query(
        `INSERT INTO claims (item_id, claimant_id, message)
         VALUES ($1, $2, $3)
         RETURNING id, item_id, claimant_id, message, status, created_at`,
        [itemId, authReq.user!.id, message]
      );

      await client.query("COMMIT");

      res.status(201).json({
        message: "Claim submitted successfully",
        claim: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");

      if ((error as { code?: string }).code === "23505") {
        res.status(409).json({
          error: "You have already submitted a claim for this item",
        });
        return;
      }

      console.error("Claim submission failed:", error);
      res.status(500).json({ error: "Unable to submit claim" });
    } finally {
      client.release();
    }
  }
);

// GET /api/items/:id/claims
// Only authorized staff can review claims.
router.get(
  "/items/:id/claims",
  authenticateToken,
  async (req, res) => {
    const authReq = req as AuthRequest;
    const itemId = req.params.id;

    if (!isStaff(authReq)) {
      res.status(403).json({ error: "Staff access required" });
      return;
    }

    if (!isValidId(itemId)) {
      res.status(400).json({ error: "Invalid item ID" });
      return;
    }

    try {
      const result = await pool.query(
        `SELECT
           c.id, c.item_id, c.claimant_id, c.message,
           c.status, c.created_at, c.updated_at,
           u.name AS claimant_name, u.email AS claimant_email
         FROM claims c
         JOIN users u ON u.id = c.claimant_id
         WHERE c.item_id = $1
         ORDER BY c.created_at ASC`,
        [itemId]
      );

      res.json({ claims: result.rows });
    } catch (error) {
      console.error("Claim listing failed:", error);
      res.status(500).json({ error: "Unable to retrieve claims" });
    }
  }
);

// PATCH /api/claims/:id
// Staff approves or rejects a pending claim.
router.patch(
  "/claims/:id",
  authenticateToken,
  async (req, res) => {
    const authReq = req as AuthRequest;
    const claimId = req.params.id;
    const decision = req.body.decision;

    if (!isStaff(authReq)) {
      res.status(403).json({ error: "Staff access required" });
      return;
    }

    if (!isValidId(claimId)) {
      res.status(400).json({ error: "Invalid claim ID" });
      return;
    }

    if (decision !== "approved" && decision !== "rejected") {
      res.status(400).json({
        error: "Decision must be approved or rejected",
      });
      return;
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Discover the item without locking the claim first.
      // All decisions for an item lock the item row first.
      const initial = await client.query(
        "SELECT item_id FROM claims WHERE id = $1",
        [claimId]
      );

      if (initial.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Claim not found" });
        return;
      }

      const itemId = String(initial.rows[0].item_id);

      const itemResult = await client.query(
        `SELECT id, type, status, custody_status
         FROM items
         WHERE id = $1
         FOR UPDATE`,
        [itemId]
      );

      if (itemResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Item not found" });
        return;
      }

      const item = itemResult.rows[0];

      const claimResult = await client.query(
        `SELECT id, item_id, status
         FROM claims
         WHERE id = $1
         FOR UPDATE`,
        [claimId]
      );

      const claim = claimResult.rows[0];

      if (claim.status !== "pending") {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "Claim is no longer pending" });
        return;
      }

      if (
        item.type !== "found" ||
        item.status !== "open" ||
        item.custody_status !== "in_custody"
      ) {
        await client.query("ROLLBACK");
        res.status(409).json({
          error: "Item is not available for claim review",
        });
        return;
      }

      const updated = await client.query(
        `UPDATE claims
         SET status = $1, updated_at = NOW()
         WHERE id = $2 AND status = 'pending'
         RETURNING id, item_id, claimant_id, status, updated_at`,
        [decision, claimId]
      );

      if (updated.rowCount !== 1) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "Claim was already processed" });
        return;
      }

      if (decision === "approved") {
        // The item can have only one approved claim at a time.
        await client.query(
          `UPDATE claims
           SET status = 'rejected', updated_at = NOW()
           WHERE item_id = $1
             AND id <> $2
             AND status = 'pending'`,
          [itemId, claimId]
        );

        await client.query(
          `UPDATE items
           SET status = 'claimed', updated_at = NOW()
           WHERE id = $1`,
          [itemId]
        );
      }

      await client.query("COMMIT");

      res.json({
        message:
          decision === "approved"
            ? "Claim approved; item is awaiting physical collection"
            : "Claim rejected; item remains available for other claims",
        claim: updated.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Claim decision failed:", error);
      res.status(500).json({ error: "Unable to process claim decision" });
    } finally {
      client.release();
    }
  }
);

// PATCH /api/claims/:id/complete
// Staff confirms that the approved claimant physically collected the item.
router.patch(
  "/claims/:id/complete",
  authenticateToken,
  async (req, res) => {
    const authReq = req as AuthRequest;
    const claimId = req.params.id;

    if (!isStaff(authReq)) {
      res.status(403).json({ error: "Staff access required" });
      return;
    }

    if (!isValidId(claimId)) {
      res.status(400).json({ error: "Invalid claim ID" });
      return;
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const initial = await client.query(
        "SELECT item_id FROM claims WHERE id = $1",
        [claimId]
      );

      if (initial.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Claim not found" });
        return;
      }

      const itemId = String(initial.rows[0].item_id);

      const itemResult = await client.query(
        `SELECT id, status, custody_status
         FROM items
         WHERE id = $1
         FOR UPDATE`,
        [itemId]
      );

      if (itemResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Item not found" });
        return;
      }

      const claimResult = await client.query(
        `SELECT id, status, claimant_id
         FROM claims
         WHERE id = $1
         FOR UPDATE`,
        [claimId]
      );

      const claim = claimResult.rows[0];
      const item = itemResult.rows[0];

      if (
        claim.status !== "approved" ||
        item.status !== "claimed" ||
        item.custody_status !== "in_custody"
      ) {
        await client.query("ROLLBACK");
        res.status(409).json({
          error: "Only an approved claim awaiting collection can be completed",
        });
        return;
      }

      await client.query(
        `UPDATE claims
         SET status = 'completed', updated_at = NOW()
         WHERE id = $1`,
        [claimId]
      );

      await client.query(
        `UPDATE items
         SET status = 'resolved',
             custody_status = 'released',
             updated_at = NOW()
         WHERE id = $1`,
        [itemId]
      );

      await client.query("COMMIT");

      res.json({
        message: "Physical handover recorded; case closed",
        item_id: itemId,
        claim_id: claimId,
        status: "resolved",
        custody_status: "released",
        claim_status: "completed",
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Handover completion failed:", error);
      res.status(500).json({ error: "Unable to complete handover" });
    } finally {
      client.release();
    }
  }
);

export default router;
