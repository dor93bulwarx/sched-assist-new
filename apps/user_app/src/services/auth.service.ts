import fs from "fs";
import path from "path";
import bcrypt from "bcrypt";
import {
  User, Role, Group, GroupMember, SingleChat, Agent, LLMModel, Vendor,
} from "@scheduling-agent/database";
import { signToken } from "../middlewares/auth";

type CoreInstructionsFile = {
  description: string;
  core_description: string;
};

let defaultAgentInstructionsCache: CoreInstructionsFile | null = null;

function getDefaultAgentInstructions(): CoreInstructionsFile {
  if (!defaultAgentInstructionsCache) {
    const filePath = path.join(__dirname, "../../../coreInstructions.json");
    const raw = fs.readFileSync(filePath, "utf-8");
    defaultAgentInstructionsCache = JSON.parse(raw) as CoreInstructionsFile;
  }
  return defaultAgentInstructionsCache;
}

export class AuthService {
  async login(userName: string, password: string) {
    const user = await User.findOne({ where: { userName } });
    if (!user || !user.password) throw Object.assign(new Error("Invalid credentials."), { status: 401 });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw Object.assign(new Error("Invalid credentials."), { status: 401 });

    // Ensure the user has at least one single chat with a personal agent
    const existingChats = await SingleChat.findAll({ where: { userId: user.id }, limit: 1 });
    if (existingChats.length === 0) {
      const defaults = getDefaultAgentInstructions();
      const agent = await Agent.create({
        definition: defaults.description,
        coreInstructions: defaults.core_description,
      });
      const sc = await SingleChat.create({
        userId: user.id,
        agentId: agent.id,
        title: "Default Chat",
      });
      await agent.update({ singleChatId: sc.id });
      await user.update({ defaultAgentId: agent.id });
    }

    let roleName = "user";
    if (user.roleId) {
      const role = await Role.findByPk(user.roleId, { attributes: ["name"] });
      if (role) roleName = role.name;
    }

    const token = signToken({
      userId: user.id,
      displayName: user.displayName,
      role: roleName,
    });

    const conversations = await this.loadUserConversations(user.id);

    return {
      token,
      user: {
        id: user.id,
        displayName: user.displayName,
        userIdentity: user.userIdentity,
        role: roleName,
        defaultAgentId: user.defaultAgentId,
      },
      conversations,
    };
  }

  async getMe(userId: string) {
    const user = await User.findByPk(userId, {
      attributes: ["id", "displayName", "userIdentity", "roleId", "defaultAgentId"],
    });
    if (!user) throw Object.assign(new Error("User not found."), { status: 404 });

    let roleName = "user";
    if (user.roleId) {
      const role = await Role.findByPk(user.roleId, { attributes: ["name"] });
      if (role) roleName = role.name;
    }

    const conversations = await this.loadUserConversations(user.id);

    return {
      id: user.id,
      displayName: user.displayName,
      userIdentity: user.userIdentity,
      role: roleName,
      defaultAgentId: user.defaultAgentId,
      conversations,
    };
  }

  async loadUserConversations(userId: string) {
    const memberships = await GroupMember.findAll({
      where: { userId },
      attributes: ["groupId"],
    });
    const groupIds = memberships.map((m) => m.groupId);

    let groups: any[] = [];
    if (groupIds.length > 0) {
      const groupRows = await Group.findAll({
        where: { id: groupIds },
        attributes: ["id", "name", "agentId", "modelId"],
        order: [["name", "ASC"]],
      });
      groups = await Promise.all(
        groupRows.map(async (g) => {
          const agent = await Agent.findByPk(g.agentId, { attributes: ["definition"] });
          return {
            id: g.id,
            name: g.name,
            agentId: g.agentId,
            agentDefinition: agent?.definition ?? null,
            model: await this.resolveModelInfo(g.modelId),
          };
        }),
      );
    }

    const singleChatRows = await SingleChat.findAll({
      where: { userId },
      attributes: ["id", "agentId", "modelId", "title"],
      order: [["created_at", "DESC"]],
    });
    const singleChats = await Promise.all(
      singleChatRows.map(async (sc) => ({
        id: sc.id,
        agentId: sc.agentId,
        title: sc.title,
        model: await this.resolveModelInfo(sc.modelId),
      })),
    );

    return { groups, singleChats };
  }

  private async resolveModelInfo(modelId: string | null) {
    if (!modelId) return null;
    const model = await LLMModel.findByPk(modelId, { attributes: ["id", "name", "slug", "vendorId"] });
    if (!model) return null;
    const vendor = await Vendor.findByPk(model.vendorId, { attributes: ["id", "name", "slug"] });
    return {
      id: model.id,
      name: model.name,
      slug: model.slug,
      vendor: vendor ? { id: vendor.id, name: vendor.name, slug: vendor.slug } : null,
    };
  }
}
