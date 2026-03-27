import { Router } from "express";
import { authMiddleware } from "../middleware/auth";

const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:3001";

const router = Router();

// ── POST /api/chat ───────────────────────────────────────────────────────────
router.post("/", authMiddleware, async (req, res) => {
  const { threadId, message } = req.body;
  const empId = req.user!.empId;

  if (!threadId || !message) {
    return res.status(400).json({ error: "threadId and message are required." });
  }

  try {
    const response = await fetch(`${AGENT_SERVICE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empId, threadId, message }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.json(data);
  } catch (err: any) {
    console.error("[chat] Proxy error:", err);
    return res.status(502).json({ error: "Agent service unavailable." });
  }
});

export { router as chatRouter };
