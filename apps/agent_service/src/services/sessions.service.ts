import { Thread, SingleChat, Group } from "@scheduling-agent/database";
import { ensureSession } from "../sessionsManagment/sessionRegistry";
import { logger } from "../logger";

export class SessionsService {
  async getSessions(userId: string, query: { groupId?: string; singleChatId?: string }) {
    const where: Record<string, unknown> = {};

    if (query.groupId) {
      where.groupId = query.groupId;
    } else {
      where.userId = userId;
      if (query.singleChatId) where.singleChatId = query.singleChatId;
    }

    const sessions = await Thread.findAll({
      where,
      order: [["updated_at", "DESC"]],
      attributes: ["id", "userId", "groupId", "singleChatId", "title", "createdAt", "updatedAt", "lastActivityAt"],
    });

    return sessions.map((s) => ({
      threadId: s.id,
      userId: s.userId,
      groupId: s.groupId,
      singleChatId: s.singleChatId,
      title: s.title,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      lastActivityAt: s.lastActivityAt,
    }));
  }

  async createSession(data: { userId: string; title?: string; groupId?: string; singleChatId?: string }) {
    let agentId: string | null = null;
    if (data.singleChatId) {
      const sc = await SingleChat.findByPk(data.singleChatId, { attributes: ["agentId"] });
      agentId = sc?.agentId ?? null;
    } else if (data.groupId) {
      const g = await Group.findByPk(data.groupId, { attributes: ["agentId"] });
      agentId = g?.agentId ?? null;
    }

    const threadId = crypto.randomUUID();
    const session = await ensureSession(threadId, data.groupId ? null : data.userId, {
      groupId: data.groupId ?? undefined,
      singleChatId: data.singleChatId ?? undefined,
      agentId,
    });

    // Point the conversation at this thread so the worker resolves it as canonical.
    if (data.groupId) {
      await Group.update({ activeThreadId: threadId }, { where: { id: data.groupId } });
    } else if (data.singleChatId) {
      await SingleChat.update({ activeThreadId: threadId }, { where: { id: data.singleChatId } });
    }

    if (data.title) {
      await session.update({ title: data.title });
    }

    return {
      threadId: session.id,
      userId: session.userId,
      groupId: session.groupId,
      singleChatId: session.singleChatId,
      title: session.title,
      createdAt: session.createdAt,
    };
  }
}
