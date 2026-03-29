import { Request, Response } from "express";
import { HistoryService } from "../services/history.service";
import { logger } from "../logger";

const historyService = new HistoryService();

export class HistoryController {
  search = async (req: Request, res: Response) => {
    const threadId = req.params.threadId as string;
    const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
    try {
      const result = await historyService.search(threadId, q);
      return res.json(result);
    } catch (err: any) {
      logger.error("/api/history/:threadId/search error", { threadId, error: err.message });
      return res.json({ results: [], total: 0 });
    }
  };

  getHistory = async (req: Request, res: Response) => {
    const threadId = req.params.threadId as string;
    try {
      const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
      const offset = req.query.offset != null ? Number(req.query.offset) : undefined;
      const result = await historyService.getHistory(threadId, { limit, offset });
      return res.json(result);
    } catch (err: any) {
      logger.error("/api/history/:threadId error", { threadId, error: err.message });
      return res.json({ messages: [], total: 0 });
    }
  };
}
