import { Router } from "express";
import { Sequelize } from "sequelize";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../logger";
import { MessageNotification } from "@scheduling-agent/database";

const router = Router();

/**
 * GET /api/notifications/unread
 * Returns a map of conversationId → unread count for the authenticated user.
 */
router.get("/unread", authMiddleware, async (req, res) => {
  const userId = req.user!.userId;

  try {
    const rows = (await MessageNotification.findAll({
      where: { recipientId: userId, status: "delivered" },
      attributes: [
        "conversationId",
        "conversationType",
        [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
      ],
      group: ["conversationId", "conversationType"],
      raw: true,
    })) as unknown as {
      conversationId: string;
      conversationType: string;
      count: string;
    }[];

    const unread: Record<string, number> = {};
    for (const row of rows) {
      unread[row.conversationId] = parseInt(row.count, 10);
    }

    return res.json(unread);
  } catch (err: any) {
    logger.error("Unread counts error", { error: err?.message });
    return res.status(500).json({ error: "Internal server error." });
  }
});

export { router as notificationsRouter };
