import { Request, Response } from "express";
import { SessionsService } from "../services/sessions.service";
import { logger } from "../logger";

export class SessionsController {
  private sessionsService = new SessionsService();

  getSessions = async (req: Request, res: Response) => {
    try {
      const data = await this.sessionsService.getSessions(
        req.user!.userId,
        req.query.groupId as string | undefined,
        req.query.singleChatId as string | undefined,
      );
      return res.json(data);
    } catch (err: any) {
      logger.error("Sessions proxy error", { error: err?.message });
      return res.status(502).json({ error: "Agent service unavailable." });
    }
  };

  createSession = async (req: Request, res: Response) => {
    try {
      const data = await this.sessionsService.createSession(
        req.user!.userId, req.body.title, req.body.groupId, req.body.singleChatId,
      );
      return res.status(201).json(data);
    } catch (err: any) {
      if (err.data) return res.status(err.status).json(err.data);
      logger.error("Sessions proxy error", { error: err?.message });
      return res.status(502).json({ error: "Agent service unavailable." });
    }
  };

  searchHistory = async (req: Request, res: Response) => {
    try {
      const data = await this.sessionsService.searchHistory(
        req.params.threadId as string, req.query.q as string | undefined,
      );
      return res.json(data);
    } catch (err: any) {
      logger.error("Search proxy error", { error: err?.message });
      return res.status(502).json({ error: "Agent service unavailable." });
    }
  };

  getHistory = async (req: Request, res: Response) => {
    try {
      const data = await this.sessionsService.getHistory(
        req.params.threadId as string,
        req.query.limit as string | undefined,
        req.query.offset as string | undefined,
      );
      return res.json(data);
    } catch (err: any) {
      logger.error("History proxy error", { error: err?.message });
      return res.status(502).json({ error: "Agent service unavailable." });
    }
  };

  getAvailableAgents = async (_req: Request, res: Response) => {
    try {
      const agents = await this.sessionsService.getAvailableAgents();
      return res.json(agents);
    } catch (err: any) {
      logger.error("GET /agents error", { error: err?.message });
      return res.status(500).json({ error: err.message });
    }
  };

  createSingleChat = async (req: Request, res: Response) => {
    if (!req.body.agentId) return res.status(400).json({ error: "agentId is required." });
    try {
      const result = await this.sessionsService.createSingleChat(req.user!.userId, req.body.agentId);
      return res.status(201).json(result);
    } catch (err: any) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      logger.error("POST /single-chats error", { error: err?.message });
      return res.status(500).json({ error: err.message });
    }
  };

  deleteSingleChat = async (req: Request, res: Response) => {
    try {
      const result = await this.sessionsService.deleteSingleChat(req.params.id as string, req.user!.userId);
      return res.json(result);
    } catch (err: any) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      logger.error("DELETE /single-chats error", { error: err?.message });
      return res.status(500).json({ error: err.message });
    }
  };

  getGroupMembers = async (req: Request, res: Response) => {
    try {
      const result = await this.sessionsService.getGroupMembers(req.params.groupId as string, req.user!.userId);
      return res.json(result);
    } catch (err: any) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      logger.error("GET /groups/:groupId/members error", { error: err?.message });
      return res.status(500).json({ error: err.message });
    }
  };
}
