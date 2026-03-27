import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { User, Agent, Group, GroupMember, SingleChat, LLMModel, Vendor } from "@scheduling-agent/database";
import { logger } from "../logger";
import { getIO } from "../sockets/server/socketServer";

const SYSTEM_USER_ID = "SYSTEM";

const router = Router();

/** Only the system user can access admin routes. */
function requireAdmin(req: any, res: any, next: any) {
  if (req.user?.userId !== SYSTEM_USER_ID) {
    return res.status(403).json({ error: "Admin access required." });
  }
  next();
}

router.use(authMiddleware, requireAdmin);

// ── GET /api/admin/users ─────────────────────────────────────────────────────
router.get("/users", async (_req, res) => {
  try {
    const users = await User.findAll({
      attributes: ["id", "displayName", "userIdentity", "createdAt"],
      order: [["created_at", "DESC"]],
    });
    return res.json(users);
  } catch (err: any) {
    logger.error("GET /users error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/agents ────────────────────────────────────────────────────
router.get("/agents", async (_req, res) => {
  try {
    const agents = await Agent.findAll({
      attributes: ["id", "definition", "coreInstructions", "singleChatId", "groupId", "createdAt"],
      order: [["created_at", "DESC"]],
    });
    return res.json(agents);
  } catch (err: any) {
    logger.error("GET /agents error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/agents ───────────────────────────────────────────────────
router.post("/agents", async (req, res) => {
  const { definition, coreInstructions } = req.body;
  try {
    const agent = await Agent.create({
      definition: definition ?? null,
      coreInstructions: coreInstructions ?? null,
    });
    return res.status(201).json(agent);
  } catch (err: any) {
    logger.error("POST /agents error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/admin/agents/:id ───────────────────────────────────────────────
router.patch("/agents/:id", async (req, res) => {
  const { definition, coreInstructions } = req.body;
  try {
    const agent = await Agent.findByPk(req.params.id);
    if (!agent) return res.status(404).json({ error: "Agent not found." });
    const patch: Record<string, any> = {};
    if (definition !== undefined) patch.definition = definition;
    if (coreInstructions !== undefined) patch.coreInstructions = coreInstructions;
    await agent.update(patch);
    return res.json(agent);
  } catch (err: any) {
    logger.error("PATCH /agents/:id error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/admin/users/:id ───────────────────────────────────────────────
router.patch("/users/:id", async (req, res) => {
  const { displayName, userIdentity } = req.body;
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found." });
    const patch: Record<string, any> = {};
    if (displayName !== undefined) patch.displayName = displayName;
    if (userIdentity !== undefined) patch.userIdentity = userIdentity;
    await user.update(patch);
    return res.json(user);
  } catch (err: any) {
    logger.error("PATCH /users/:id error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/groups ────────────────────────────────────────────────────
router.get("/groups", async (_req, res) => {
  try {
    const groups = await Group.findAll({
      attributes: ["id", "name", "agentId", "createdAt"],
      order: [["created_at", "DESC"]],
    });
    return res.json(groups);
  } catch (err: any) {
    logger.error("GET /groups error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/groups ───────────────────────────────────────────────────
router.post("/groups", async (req, res) => {
  const { name, agentId, memberUserIds } = req.body;
  if (!name || !agentId) {
    return res.status(400).json({ error: "name and agentId are required." });
  }
  // Require at least one non-SYSTEM member
  const extraMembers: string[] = Array.isArray(memberUserIds)
    ? memberUserIds.filter((id: string) => id !== SYSTEM_USER_ID)
    : [];
  if (extraMembers.length === 0) {
    return res.status(400).json({ error: "At least one user (besides yourself) must be added to the group." });
  }
  try {
    // Validate the agent is unattached (exclusive assignment)
    const agent = await Agent.findByPk(agentId, { attributes: ["id", "singleChatId", "groupId", "definition"] });
    if (!agent) {
      return res.status(404).json({ error: "Agent not found." });
    }
    if (agent.singleChatId || agent.groupId) {
      return res.status(409).json({ error: "This agent is already attached to another conversation." });
    }

    const group = await Group.create({ name, agentId });

    // Link the agent to this group (exclusive assignment)
    await agent.update({ groupId: group.id });

    // Auto-add SYSTEM + selected members
    const allMembers = [SYSTEM_USER_ID, ...extraMembers];
    const uniqueMembers = [...new Set(allMembers)];
    await Promise.all(
      uniqueMembers.map((userId) =>
        GroupMember.findOrCreate({
          where: { groupId: group.id, userId },
          defaults: { groupId: group.id, userId },
        }),
      ),
    );

    // Notify each non-SYSTEM member so their sidebar updates in real-time
    for (const userId of extraMembers) {
      getIO().to(`user:${userId}`).emit("conversations:updated", {
        action: "group_added",
        group: {
          id: group.id,
          name: group.name,
          agentId: group.agentId,
          agentDefinition: agent?.definition ?? null,
        },
      });
    }

    return res.status(201).json(group);
  } catch (err: any) {
    logger.error("POST /groups error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/admin/groups/:id ───────────────────────────────────────────────
router.patch("/groups/:id", async (req, res) => {
  const { name } = req.body;
  try {
    const group = await Group.findByPk(req.params.id);
    if (!group) return res.status(404).json({ error: "Group not found." });
    if (name !== undefined) await group.update({ name });
    return res.json(group);
  } catch (err: any) {
    logger.error("PATCH /groups/:id error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/groups/:groupId/members ───────────────────────────────────
router.get("/groups/:groupId/members", async (req, res) => {
  try {
    const members = await GroupMember.findAll({
      where: { groupId: req.params.groupId },
      attributes: ["id", "userId", "createdAt"],
    });
    return res.json(members);
  } catch (err: any) {
    logger.error("GET /groups/:id/members error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/groups/:groupId/members ──────────────────────────────────
router.post("/groups/:groupId/members", async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "userId is required." });
  }
  try {
    const [member, created] = await GroupMember.findOrCreate({
      where: { groupId: req.params.groupId, userId },
      defaults: { groupId: req.params.groupId, userId },
    });

    // Notify the added user so their sidebar updates in real-time
    if (created) {
      const group = await Group.findByPk(req.params.groupId, {
        attributes: ["id", "name", "agentId", "modelId"],
      });
      if (group) {
        const agent = await Agent.findByPk(group.agentId, { attributes: ["definition"] });
        getIO().to(`user:${userId}`).emit("conversations:updated", {
          action: "group_added",
          group: {
            id: group.id,
            name: group.name,
            agentId: group.agentId,
            agentDefinition: agent?.definition ?? null,
          },
        });
      }
    }

    return res.status(created ? 201 : 200).json(member);
  } catch (err: any) {
    logger.error("POST /groups/:id/members error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/admin/groups/:groupId/members/:userId ────────────────────────
router.delete("/groups/:groupId/members/:userId", async (req, res) => {
  try {
    const deleted = await GroupMember.destroy({
      where: { groupId: req.params.groupId, userId: req.params.userId },
    });

    // Notify the removed user so their sidebar updates
    if (deleted > 0) {
      getIO().to(`user:${req.params.userId}`).emit("conversations:updated", {
        action: "group_removed",
        groupId: req.params.groupId,
      });
    }

    return res.json({ deleted });
  } catch (err: any) {
    logger.error("DELETE member error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/models ─────────────────────────────────────────────────────
router.get("/models", async (_req, res) => {
  try {
    const models = await LLMModel.findAll({
      attributes: ["id", "vendorId", "name", "slug"],
      order: [["name", "ASC"]],
    });
    const vendors = await Vendor.findAll({ attributes: ["id", "name", "slug"] });
    const vendorMap = Object.fromEntries(vendors.map((v) => [v.id, { id: v.id, name: v.name, slug: v.slug }]));
    const result = models.map((m) => ({
      id: m.id,
      name: m.name,
      slug: m.slug,
      vendor: vendorMap[m.vendorId] ?? null,
    }));
    return res.json(result);
  } catch (err: any) {
    logger.error("GET /models error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/vendors ────────────────────────────────────────────────────
router.get("/vendors", async (_req, res) => {
  try {
    const vendors = await Vendor.findAll({
      attributes: ["id", "name", "slug"],
      order: [["name", "ASC"]],
    });
    return res.json(vendors);
  } catch (err: any) {
    logger.error("GET /vendors error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/models ───────────────────────────────────────────────────
router.post("/models", async (req, res) => {
  const { vendorId, name, slug } = req.body;
  if (!vendorId || !name || !slug) {
    return res.status(400).json({ error: "vendorId, name, and slug are required." });
  }

  try {
    // Check vendor exists
    const vendor = await Vendor.findByPk(vendorId);
    if (!vendor) return res.status(404).json({ error: "Vendor not found." });

    // Check for duplicate slug
    const existingSlug = await LLMModel.findOne({ where: { slug } });
    if (existingSlug) {
      return res.status(409).json({ error: `A model with slug "${slug}" already exists.` });
    }

    // Check for duplicate name within same vendor
    const existingName = await LLMModel.findOne({ where: { vendorId, name } });
    if (existingName) {
      return res.status(409).json({ error: `A model named "${name}" already exists for ${vendor.name}.` });
    }

    const model = await LLMModel.create({ vendorId, name, slug });
    return res.status(201).json({
      id: model.id,
      name: model.name,
      slug: model.slug,
      vendor: { id: vendor.id, name: vendor.name, slug: vendor.slug },
    });
  } catch (err: any) {
    logger.error("POST /models error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/admin/models/:id ─────────────────────────────────────────────
router.delete("/models/:id", async (req, res) => {
  try {
    const model = await LLMModel.findByPk(req.params.id);
    if (!model) return res.status(404).json({ error: "Model not found." });

    // Check if any single chats or groups are using this model
    const scCount = await SingleChat.count({ where: { modelId: req.params.id } });
    const gCount = await Group.count({ where: { modelId: req.params.id } });
    if (scCount > 0 || gCount > 0) {
      return res.status(409).json({
        error: `Cannot delete — this model is in use by ${scCount} chat(s) and ${gCount} group(s). Switch them to a different model first.`,
      });
    }

    await model.destroy();
    return res.json({ deleted: true });
  } catch (err: any) {
    logger.error("DELETE /models/:id error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ── Helper: check if vendor API key is configured ────────────────────────────
const VENDOR_API_KEY_ENV: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_API_KEY",
};

async function validateModelApiKey(modelId: string): Promise<string | null> {
  const model = await LLMModel.findByPk(modelId, { attributes: ["vendorId"] });
  if (!model) return "Model not found.";
  const vendor = await Vendor.findByPk(model.vendorId, { attributes: ["slug", "name"] });
  if (!vendor) return "Vendor not found.";
  const envVar = VENDOR_API_KEY_ENV[vendor.slug];
  if (envVar && !process.env[envVar]) {
    return `API key not configured for ${vendor.name}. Set the ${envVar} environment variable first.`;
  }
  return null;
}

// ── PATCH /api/admin/single-chats/:id/model ──────────────────────────────────
router.patch("/single-chats/:id/model", async (req, res) => {
  const { modelId } = req.body;
  try {
    const sc = await SingleChat.findByPk(req.params.id);
    if (!sc) return res.status(404).json({ error: "Single chat not found." });

    if (modelId) {
      const keyError = await validateModelApiKey(modelId);
      if (keyError) return res.status(400).json({ error: keyError });
    }

    await sc.update({ modelId: modelId ?? null });
    return res.json(sc);
  } catch (err: any) {
    logger.error("PATCH single-chat model error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/admin/groups/:id/model ────────────────────────────────────────
router.patch("/groups/:id/model", async (req, res) => {
  const { modelId } = req.body;
  try {
    const group = await Group.findByPk(req.params.id);
    if (!group) return res.status(404).json({ error: "Group not found." });

    if (modelId) {
      const keyError = await validateModelApiKey(modelId);
      if (keyError) return res.status(400).json({ error: keyError });
    }

    await group.update({ modelId: modelId ?? null });
    return res.json(group);
  } catch (err: any) {
    logger.error("PATCH group model error:", err);
    return res.status(500).json({ error: err.message });
  }
});

export { router as adminRouter };
