import {
  SingleChat, Agent, Thread, EpisodicMemory, GroupMember, User, sequelize,
} from "@scheduling-agent/database";
import { Op } from "sequelize";
import { logger } from "../logger";

const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:3001";

export class SessionsService {
  async getSessions(userId: string, groupId?: string, singleChatId?: string) {
    const params = new URLSearchParams();
    if (groupId) params.set("groupId", groupId);
    if (singleChatId) params.set("singleChatId", singleChatId);
    const qs = params.toString();
    const url = `${AGENT_SERVICE_URL}/api/sessions/${userId}${qs ? `?${qs}` : ""}`;
    const response = await fetch(url);
    return response.json();
  }

  async createSession(userId: string, title?: string, groupId?: string, singleChatId?: string) {
    const response = await fetch(`${AGENT_SERVICE_URL}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        title,
        ...(groupId ? { groupId } : {}),
        ...(singleChatId ? { singleChatId } : {}),
      }),
    });
    const data: any = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error ?? "Session creation failed"), { status: response.status, data });
    return data;
  }

  async searchHistory(threadId: string, q?: string) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const response = await fetch(`${AGENT_SERVICE_URL}/api/history/${threadId}/search?${params}`);
    return response.json();
  }

  async getHistory(threadId: string, limit?: string, offset?: string) {
    const params = new URLSearchParams();
    if (limit) params.set("limit", limit);
    if (offset) params.set("offset", offset);
    const qs = params.toString();
    const response = await fetch(`${AGENT_SERVICE_URL}/api/history/${threadId}${qs ? `?${qs}` : ""}`);
    return response.json();
  }

  async getAvailableAgents() {
    return Agent.findAll({
      where: { singleChatId: null, groupId: null },
      attributes: ["id", "definition"],
      order: [["created_at", "ASC"]],
    });
  }

  async createSingleChat(userId: string, agentId: string) {
    const agent = await Agent.findByPk(agentId, { attributes: ["id", "definition", "singleChatId", "groupId"] });
    if (!agent) throw Object.assign(new Error("Agent not found."), { status: 404 });
    if (agent.singleChatId || agent.groupId) {
      throw Object.assign(new Error("This agent is already attached to another conversation."), { status: 409 });
    }

    const sc = await SingleChat.create({ userId, agentId, title: agent.definition || "Agent Chat" });
    await agent.update({ singleChatId: sc.id });

    return { id: sc.id, agentId: sc.agentId, title: sc.title, model: null };
  }

  async deleteSingleChat(scId: string, userId: string) {
    const sc = await SingleChat.findByPk(scId);
    if (!sc) throw Object.assign(new Error("Single chat not found."), { status: 404 });
    if (sc.userId !== userId) throw Object.assign(new Error("You can only delete your own chats."), { status: 403 });

    const owner = await User.findByPk(userId, { attributes: ["defaultAgentId"] });
    if (owner && owner.defaultAgentId && sc.agentId === owner.defaultAgentId) {
      throw Object.assign(new Error("You cannot delete your default agent chat."), { status: 403 });
    }

    const chatCount = await SingleChat.count({ where: { userId } });
    if (chatCount <= 1) throw Object.assign(new Error("You cannot delete your last remaining chat."), { status: 403 });

    const threads = await Thread.findAll({ where: { singleChatId: scId }, attributes: ["id"] });
    const threadIds = threads.map((t) => t.id);

    await sequelize.transaction(async (t) => {
      if (threadIds.length > 0) {
        await EpisodicMemory.destroy({ where: { threadId: { [Op.in]: threadIds } }, transaction: t });
        for (const tid of threadIds) {
          await sequelize.query(`DELETE FROM checkpoint_blobs WHERE thread_id = :tid`, { replacements: { tid }, transaction: t });
          await sequelize.query(`DELETE FROM checkpoint_writes WHERE thread_id = :tid`, { replacements: { tid }, transaction: t });
          await sequelize.query(`DELETE FROM checkpoints WHERE thread_id = :tid`, { replacements: { tid }, transaction: t });
        }
        await Thread.destroy({ where: { singleChatId: scId }, transaction: t });
      }
      await sc.destroy({ transaction: t });
    });

    await Agent.update({ singleChatId: null }, { where: { singleChatId: scId } });

    logger.info("Single chat deleted with cascade", { scId, userId, threadCount: threadIds.length });
    return { deleted: true };
  }

  async getGroupMembers(groupId: string, userId: string) {
    const membership = await GroupMember.findOne({ where: { groupId, userId } });
    if (!membership) throw Object.assign(new Error("You are not a member of this group."), { status: 403 });

    const members = await GroupMember.findAll({ where: { groupId }, attributes: ["userId"] });
    const userIds = members.map((m) => m.userId);
    const users = await User.findAll({ where: { id: userIds }, attributes: ["id", "displayName"] });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u.displayName]));

    return userIds.map((id) => ({ userId: id, displayName: userMap[id] ?? null }));
  }
}
