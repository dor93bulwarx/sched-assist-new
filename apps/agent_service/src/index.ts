/**
 * Entry point for the agent_service container.
 *
 * Initialises the PostgreSQL connection, runs the LangGraph Postgres
 * checkpointer setup, compiles the scheduler graph with persistence,
 * and starts an Express HTTP server on port 3001.
 */

import { sequelize } from "@scheduling-agent/database";
import { createSchedulerGraph } from "./graph/index";
import { createServer } from "./server";

const PORT = parseInt(process.env.PORT ?? "3001", 10);

async function main(): Promise<void> {
  console.log("[agent_service] Starting…");

  // 1. Verify database connectivity.
  await sequelize.authenticate();
  console.log("[agent_service] Database connection OK.");

  // 2. Create checkpointer + compile graph with Postgres persistence.
  const graph = await createSchedulerGraph();
  console.log("[agent_service] Scheduler graph compiled with PostgresSaver checkpointer.");

  // 3. Start HTTP server.
  const app = createServer(graph);
  app.listen(PORT, () => {
    console.log(`[agent_service] HTTP server listening on port ${PORT}.`);
  });
}

main().catch((err) => {
  console.error("[agent_service] Fatal:", err);
  process.exit(1);
});
