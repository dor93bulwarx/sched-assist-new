import { AgentSession } from "@scheduling-agent/database";
import type { EmployeeId } from "@scheduling-agent/types";

/**
 * Ensures an `agent_sessions` row exists for the given thread and
 * employee. Creates one if it doesn't exist yet (new conversation),
 * or returns the existing row (resumed conversation).
 *
 * Also validates that the `emp_id` on the stored row matches the
 * caller — a mismatch would indicate a session-isolation breach.
 */
export async function ensureSession(
  threadId: string,
  empId: EmployeeId,
): Promise<AgentSession> {
  const [session, created] = await AgentSession.findOrCreate({
    where: { threadId },
    defaults: {
      threadId,
      empId,
      lastActivityAt: new Date(),
    },
  });

  if (!created && session.empId !== empId) {
    throw new Error(
      `Session isolation violation: thread ${threadId} belongs to emp ${session.empId}, not ${empId}.`,
    );
  }

  // Bump activity timestamp on every touch.
  if (!created) {
    await session.update({ lastActivityAt: new Date() });
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
  await AgentSession.update(
    {
      summary: { text: summaryText, createdAt: new Date().toISOString() },
      summarizedAt: new Date(),
    },
    { where: { threadId } },
  );
}
