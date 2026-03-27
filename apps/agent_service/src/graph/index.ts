import { StateGraph, START, END } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { SchedulerAgentAnnotation, SchedulerAgentState } from "../state";
import { summarizationGuardNode } from "./nodes/summarizationGuard";
import { sessionSummarizationNode } from "./nodes/sessionSummarization";
import { contextBuilderNode } from "./nodes/contextBuilder";

// ─── Routing helpers ─────────────────────────────────────────────────────────

function routeAfterGuard(state: SchedulerAgentState): string {
  if (state.error) return END;
  if (state.needsSummarization) return "sessionSummarization";
  return "assembleContext";
}

function routeAfterContext(state: SchedulerAgentState): string {
  if (state.error) return END;
  return END; // Extend: route to agent / tool-calling nodes in later milestones.
}

// ─── Graph definition ────────────────────────────────────────────────────────
//
//  START → summarizationGuard
//            ├── (thresholds exceeded) → sessionSummarization → assembleContext → END
//            └── (normal)              → assembleContext → END
//

const workflow = new StateGraph(SchedulerAgentAnnotation)
  .addNode("summarizationGuard", summarizationGuardNode)
  .addNode("sessionSummarization", sessionSummarizationNode)
  .addNode("assembleContext", contextBuilderNode)

  .addEdge(START, "summarizationGuard")

  .addConditionalEdges("summarizationGuard", routeAfterGuard, {
    sessionSummarization: "sessionSummarization",
    assembleContext: "assembleContext",
    [END]: END,
  })

  .addEdge("sessionSummarization", "assembleContext")

  .addConditionalEdges("assembleContext", routeAfterContext, { [END]: END });

/**
 * Creates the Postgres checkpointer, runs its setup (creates checkpoint
 * tables if they don't exist), and compiles the graph with persistence.
 *
 * Call once at startup; the returned graph can then be invoked per request
 * with `configurable.thread_id` to load/save per-conversation state.
 */
export async function createSchedulerGraph() {
  const connectionString =
    process.env.DATABASE_URL ??
    `postgres://${process.env.PGUSER ?? "scheduler"}:${process.env.PGPASSWORD ?? "scheduler_pass"}@${process.env.PGHOST ?? "localhost"}:${process.env.PGPORT ?? "5432"}/${process.env.PGDATABASE ?? "scheduler_agent"}`;

  const checkpointer = PostgresSaver.fromConnString(connectionString);

  // Creates the library's checkpoint tables if they don't already exist.
  await checkpointer.setup();

  const graph = workflow.compile({ checkpointer });

  return graph;
}

/** Re-export the raw workflow for unit tests that don't need persistence. */
export { workflow };
