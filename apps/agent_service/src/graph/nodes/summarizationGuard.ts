import { AgentSession } from "@scheduling-agent/database";
import type { SchedulerAgentState } from "../../state";

/**
 * Default thresholds — override via environment variables.
 *
 * TTL_IDLE_MINUTES:  max minutes since last activity before the session
 *                    is considered expired and must be summarized.
 * MAX_MESSAGES:      max message count in the conversation before
 *                    compaction via summarization is required.
 * MAX_CHECKPOINT_BYTES: max checkpoint payload size (if tracked) before
 *                       summarization fires.
 */
const TTL_IDLE_MINUTES = parseInt(process.env.TTL_IDLE_MINUTES ?? "30", 10);
const MAX_MESSAGES = parseInt(process.env.MAX_MESSAGES ?? "50", 10);
const MAX_CHECKPOINT_BYTES = parseInt(
  process.env.MAX_CHECKPOINT_BYTES ?? "500000",
  10,
);

/**
 * Guard node that evaluates TTL and size thresholds for the current session.
 *
 * Runs at the very start of every turn. Sets `needsSummarization = true`
 * when any threshold is exceeded so the routing function can branch to
 * the sessionSummarization node before context assembly.
 */
export async function summarizationGuardNode(
  state: SchedulerAgentState,
): Promise<Partial<SchedulerAgentState>> {
  if (state.error) return {};

  const { threadId, messages } = state;

  try {
    // ── Size check: message count ────────────────────────────────────
    if (messages && messages.length >= MAX_MESSAGES) {
      console.log(
        `[summarizationGuard] Message count (${messages.length}) >= ${MAX_MESSAGES} — summarization required.`,
      );
      return { needsSummarization: true };
    }

    // ── DB-backed checks (TTL + checkpoint size) ─────────────────────
    const session = await AgentSession.findOne({ where: { threadId } });

    if (!session) {
      // New session — nothing to summarize yet.
      return { needsSummarization: false };
    }

    // TTL: idle too long since last activity.
    if (session.lastActivityAt) {
      const idleMs = Date.now() - new Date(session.lastActivityAt).getTime();
      const idleMinutes = idleMs / 60_000;
      if (idleMinutes >= TTL_IDLE_MINUTES && !session.summarizedAt) {
        console.log(
          `[summarizationGuard] Idle ${Math.round(idleMinutes)}m >= ${TTL_IDLE_MINUTES}m — summarization required.`,
        );
        return { needsSummarization: true };
      }
    }

    // TTL: hard expiry.
    if (session.ttlExpiresAt && new Date(session.ttlExpiresAt) <= new Date()) {
      console.log(
        "[summarizationGuard] TTL expired — summarization required.",
      );
      return { needsSummarization: true };
    }

    // Size: checkpoint byte estimate (if tracked by the application).
    if (
      session.checkpointSizeBytes &&
      Number(session.checkpointSizeBytes) >= MAX_CHECKPOINT_BYTES
    ) {
      console.log(
        `[summarizationGuard] Checkpoint size (${session.checkpointSizeBytes}) >= ${MAX_CHECKPOINT_BYTES} — summarization required.`,
      );
      return { needsSummarization: true };
    }

    return { needsSummarization: false };
  } catch (err) {
    console.error("[summarizationGuard]", err);
    // On guard failure, skip summarization and proceed normally.
    return { needsSummarization: false };
  }
}
