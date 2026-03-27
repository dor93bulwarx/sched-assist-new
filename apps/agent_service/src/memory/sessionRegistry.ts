import { Thread } from "@scheduling-agent/database";
import type { UserId } from "@scheduling-agent/types";
import { logger } from "../logger";

export type EnsureSessionScope = {
  groupId?: string | null;
  singleChatId?: string | null;
  agentId?: string | null;
};

/**
 * Ensures a `threads` row exists for the given thread and
 * user. Creates one if it doesn't exist yet (new conversation),
 * or returns the existing row (resumed conversation).
 *
 * Also validates that the `user_id` on the stored row matches the
 * caller — a mismatch would indicate a session-isolation breach.
 */
export async function ensureSession(
  threadId: string,
  userId: UserId,
  scope: EnsureSessionScope = {},
): Promise<Thread> {
  const { groupId = null, singleChatId = null, agentId = null } = scope;

  const [session, created] = await Thread.findOrCreate({
    where: { threadId },
    defaults: {
      threadId,
      userId,
      groupId,
      singleChatId,
      agentId,
      lastActivityAt: new Date(),
    },
  });

  if (created) {
    logger.info("Session created", { threadId, userId, groupId, singleChatId });
  }

  if (!created && session.userId !== userId) {
    logger.error("Session isolation violation", { threadId, ownerUserId: session.userId, callerUserId: userId });
    throw new Error(
      `Session isolation violation: thread ${threadId} belongs to user ${session.userId}, not ${userId}.`,
    );
  }

  // Bump activity; backfill scope columns if the client now supplies them.
  if (!created) {
    const patch: { lastActivityAt: Date; groupId?: string | null; singleChatId?: string | null; agentId?: string | null } =
      { lastActivityAt: new Date() };
    if (groupId != null && session.groupId == null) {
      patch.groupId = groupId;
    }
    if (singleChatId != null && session.singleChatId == null) {
      patch.singleChatId = singleChatId;
    }
    if (agentId != null && session.agentId == null) {
      patch.agentId = agentId;
    }
    await session.update(patch);
  }

  return session;
}

/**
 * Marks a session's summary JSONB column and sets `summarized_at`.
 */
export async function writeSummary(
  threadId: string,
  summaryText: string,
): Promise<void> {
  logger.info("Writing session summary", { threadId, summaryLen: summaryText.length });
  await Thread.update(
    {
      summary: { text: summaryText, createdAt: new Date().toISOString() },
      summarizedAt: new Date(),
    },
    { where: { threadId } },
  );
}
