import { AgentSession } from "@scheduling-agent/database";
import { Op } from "sequelize";
import type { EmployeeId, SessionSummary } from "@scheduling-agent/types";

/** How far back (in hours) to look for recent session summaries. */
const SUMMARY_WINDOW_HOURS = 48;
/** Maximum number of recent summaries to inject into context. */
const MAX_SUMMARIES = 2;

/**
 * Loads up to two of the most recent session summaries for `empId` from
 * the `agent_sessions` table, where `summary IS NOT NULL` and
 * `summarized_at` is within the last 48 hours.
 *
 * Results are ordered by `summarized_at DESC` so the newest summary
 * comes first.  This helper is called from contextBuilder on every turn
 * and is **additive** to pgvector episodic retrieval.
 */
export async function loadRecentSessionSummaries(
  empId: EmployeeId,
): Promise<SessionSummary[]> {
  try {
    const cutoff = new Date(
      Date.now() - SUMMARY_WINDOW_HOURS * 60 * 60 * 1000,
    );

    const rows = await AgentSession.findAll({
      where: {
        empId,
        summary: { [Op.ne]: null },
        summarizedAt: { [Op.gte]: cutoff },
      },
      order: [["summarized_at", "DESC"]],
      limit: MAX_SUMMARIES,
      attributes: ["summary"],
    });

    return rows
      .map((r) => r.summary)
      .filter((s): s is SessionSummary => s !== null);
  } catch (err) {
    console.error(
      `[sessionSummaryLoader] Failed to load summaries for emp ${empId}:`,
      err,
    );
    return [];
  }
}
