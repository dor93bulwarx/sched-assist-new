import { User, Agent, SingleChat, GroupMember, Group } from "@scheduling-agent/database";
import { Op } from "sequelize";
import { getIO } from "../../sockets/server/socketServer";
import { logger } from "../../logger";

export class AgentsService {
  async getAll(callerId: string, callerRole: string) {
    const agents = await Agent.findAll({
      attributes: ["id", "definition", "coreInstructions", "singleChatId", "groupId", "createdAt"],
      order: [["created_at", "DESC"]],
    });

    const defaultAgentIds = await this.getDefaultAgentIds();
    const editableIds = await this.getEditableAgentIds(callerId, callerRole);

    return agents.map((a) => ({
      ...a.toJSON(),
      isDefault: defaultAgentIds.has(a.id),
      editable: editableIds.has(a.id),
    }));
  }

  async create(definition?: string, coreInstructions?: string, actorId?: string) {
    const agent = await Agent.create({
      definition: definition ?? null,
      coreInstructions: coreInstructions ?? null,
    });
    this.broadcast("agent_created", `Agent "${agent.definition || "Unnamed"}" created`, { agent }, actorId);
    return agent;
  }

  async update(agentId: string, callerId: string, callerRole: string, data: { definition?: string; coreInstructions?: string }) {
    const agent = await Agent.findByPk(agentId);
    if (!agent) throw Object.assign(new Error("Agent not found."), { status: 404 });

    const editableIds = await this.getEditableAgentIds(callerId, callerRole);
    if (!editableIds.has(agent.id)) {
      throw Object.assign(new Error("You do not have permission to edit this agent."), { status: 403 });
    }

    const patch: Record<string, any> = {};
    if (data.definition !== undefined) patch.definition = data.definition;
    if (data.coreInstructions !== undefined) patch.coreInstructions = data.coreInstructions;
    await agent.update(patch);
    this.broadcast("agent_updated", `Agent "${agent.definition || "Unnamed"}" updated`, { agent }, callerId);
    return agent;
  }

  async getEditableAgentIds(userId: string, role: string): Promise<Set<string>> {
    const defaultAgentIds = await this.getDefaultAgentIds();

    if (role === "super_admin") {
      const allAgents = await Agent.findAll({ attributes: ["id"] });
      const ids = new Set<string>();
      for (const a of allAgents) {
        if (!defaultAgentIds.has(a.id)) ids.add(a.id);
      }
      return ids;
    }

    const ids = new Set<string>();

    const userChats = await SingleChat.findAll({ where: { userId }, attributes: ["agentId"] });
    for (const sc of userChats) {
      if (!defaultAgentIds.has(sc.agentId)) ids.add(sc.agentId);
    }

    const memberships = await GroupMember.findAll({ where: { userId }, attributes: ["groupId"] });
    if (memberships.length > 0) {
      const groupIds = memberships.map((m) => m.groupId);
      const groups = await Group.findAll({ where: { id: groupIds }, attributes: ["agentId"] });
      for (const g of groups) {
        if (!defaultAgentIds.has(g.agentId)) ids.add(g.agentId);
      }
    }

    return ids;
  }

  private async getDefaultAgentIds(): Promise<Set<string | null>> {
    const rows = await User.findAll({
      where: { defaultAgentId: { [Op.ne]: null } },
      attributes: ["defaultAgentId"],
    });
    return new Set(rows.map((u) => u.defaultAgentId));
  }

  private broadcast(type: string, message: string, data: Record<string, unknown>, actorId?: string) {
    try {
      getIO().emit("admin:change", { type, message, data, actorId });
    } catch (err) {
      logger.error("broadcastAdminChange error", { error: String(err) });
    }
  }
}
