import { Request, Response } from "express";
import { NotificationsService } from "../services/notifications.service";
import { logger } from "../logger";

export class NotificationsController {
  private notificationsService = new NotificationsService();

  getUnreadCounts = async (req: Request, res: Response) => {
    try {
      const unread = await this.notificationsService.getUnreadCounts(req.user!.userId);
      return res.json(unread);
    } catch (err: any) {
      logger.error("Unread counts error", { error: err?.message });
      return res.status(500).json({ error: "Internal server error." });
    }
  };
}
