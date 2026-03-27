import { SingleChat, Group, LLMModel } from "@scheduling-agent/database";
import { logger } from "../logger";

/**
 * Resolves the LLM model slug for a conversation from the DB (authoritative).
 * Used each turn so checkpointed graph state cannot serve a stale model.
 */
export async function resolveModelSlug(
  singleChatId?: string | null,
  groupId?: string | null,
): Promise<string> {
  try {
    let modelId: string | null = null;

    if (singleChatId) {
      logger.info("Resolving model slug for single chat", { singleChatId });
      const sc = await SingleChat.findByPk(singleChatId, { attributes: ["modelId"] });
      logger.info("SingleChat found", { singleChatId, modelId: sc?.modelId });
      modelId = sc?.modelId ?? null;
    } else if (groupId) {
      const g = await Group.findByPk(groupId, { attributes: ["modelId"] });
      logger.info("Group found", { groupId, modelId: g?.modelId });
      modelId = g?.modelId ?? null;
    }

    if (modelId) {
      const model = await LLMModel.findByPk(modelId, { attributes: ["slug"] });
      logger.info("Model found", { modelId, slug: model?.slug });
      if (model) return model.slug;
    }
  } catch {
    // Fall through to default
  }
  return "gpt-4o";
}
