import { sequelize } from "@scheduling-agent/database";
import type { AgentId } from "@scheduling-agent/types";
import { QueryTypes } from "sequelize";

import { logger } from "../logger";

/**
 * Retrieves the top-K most similar episodic memory chunks for a query embedding.
 *
 * **Isolation:** filters by `agent_id` so memory follows the agent across
 * conversations (single chats, groups, or reassignments).
 *
 * @param agentId    - The agent whose episodic memory to search.
 * @param embedding  - Query vector (same dimension as `episodic_memory.embedding`).
 * @param topK       - Number of chunks to return (default 5).
 */
export async function retrieveEpisodicMemory(
  agentId: AgentId | null,
  embedding: number[],
  topK = 5,
): Promise<string[]> {
  if (!agentId) {
    return [];
  }

  const vectorLiteral = `[${embedding.join(",")}]`;

  try {
    const rows = await sequelize.query<{ content: string }>(
      `SELECT ep.content
       FROM   episodic_memory ep
       WHERE  ep.agent_id = :agentId
       ORDER  BY ep.embedding <=> :embedding::vector
       LIMIT  :topK`,
      {
        replacements: {
          agentId,
          embedding: vectorLiteral,
          topK,
        },
        type: QueryTypes.SELECT,
      },
    );

    return rows.map((r) => r.content);
  } catch (err) {
    logger.error("Episodic memory retrieval failed", { agentId, error: String(err) });
    return [];
  }
}
