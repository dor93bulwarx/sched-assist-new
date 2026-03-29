import { ConversationMessage } from "@scheduling-agent/database";
import { logger } from "../logger";

/**
 * Appends a single row to `conversation_messages` — the conversation-scoped
 * transcript that survives thread rotation.
 *
 * Called from the worker (inside the conversation lock) for both user and
 * assistant messages.
 */
export async function writeConversationMessage(params: {
  groupId: string | null;
  singleChatId: string | null;
  threadId: string;
  role: "user" | "assistant";
  content: string;
  senderName?: string | null;
  requestId?: string | null;
  modelSlug?: string | null;
  vendorSlug?: string | null;
  modelName?: string | null;
}): Promise<void> {
  try {
    await ConversationMessage.create({
      groupId: params.groupId,
      singleChatId: params.singleChatId,
      threadId: params.threadId,
      role: params.role,
      content: params.content,
      senderName: params.senderName ?? null,
      requestId: params.requestId ?? null,
      modelSlug: params.modelSlug ?? null,
      vendorSlug: params.vendorSlug ?? null,
      modelName: params.modelName ?? null,
    });
  } catch (err: any) {
    // Log but don't throw — conversation_messages is a secondary store.
    // The checkpoint (primary) and the socket reply have already happened or will happen.
    logger.error("Failed to write conversation message", {
      threadId: params.threadId,
      role: params.role,
      error: err?.message,
    });
  }
}
