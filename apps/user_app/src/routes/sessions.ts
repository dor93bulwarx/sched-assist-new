import { Router } from "express";
import { authMiddleware } from "../middleware/auth";

const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:3001";

const router = Router();

// ── GET /api/sessions ────────────────────────────────────────────────────────
router.get("/", authMiddleware, async (req, res) => {
  const empId = req.user!.empId;

  try {
    const response = await fetch(`${AGENT_SERVICE_URL}/api/sessions/${empId}`);
    const data = await response.json();
    return res.json(data);
  } catch (err: any) {
    console.error("[sessions] Proxy error:", err);
    return res.status(502).json({ error: "Agent service unavailable." });
  }
});

// ── POST /api/sessions ───────────────────────────────────────────────────────
router.post("/", authMiddleware, async (req, res) => {
  const empId = req.user!.empId;
  const { title } = req.body;

  try {
    const response = await fetch(`${AGENT_SERVICE_URL}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empId, title }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(201).json(data);
  } catch (err: any) {
    console.error("[sessions] Proxy error:", err);
    return res.status(502).json({ error: "Agent service unavailable." });
  }
});

export { router as sessionsRouter };
