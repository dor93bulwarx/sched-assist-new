import { sequelize } from "@scheduling-agent/database";
import { QueryTypes } from "sequelize";
import type { EmployeeId } from "@scheduling-agent/types";

/** Maximum number of episodic chunks returned per query. */
const DEFAULT_TOP_K = 5;

interface EpisodicRow {
  id: string;
  content: string;
  metadata: Record<string, unknown> | null;
  distance: number;
}

/**
 * Retrieves the most relevant episodic memory chunks for the given employee
 * using cosine similarity search over pgvector embeddings.
 *
 * **Isolation:** every query hard-filters by `emp_id` so results are
 * exclusively those belonging to the requesting employee.
 *
 * @param empId      - The employee whose episodic memory to search.
 * @param embedding  - The query embedding vector (must match EMBEDDING_DIMENSION).
 * @param topK       - How many chunks to return (default 5).
 * @returns An array of content strings ordered by relevance (closest first).
 */
export async function retrieveEpisodicMemory(
  empId: EmployeeId,
  embedding: number[],
  topK: number = DEFAULT_TOP_K,
): Promise<string[]> {
  try {
    const vectorLiteral = `[${embedding.join(",")}]`;

    const rows = await sequelize.query<EpisodicRow>(
      `SELECT id, content, metadata,
              embedding <=> :embedding AS distance
       FROM   episodic_memory
       WHERE  emp_id = :empId
       ORDER  BY distance ASC
       LIMIT  :topK`,
      {
        replacements: { empId, embedding: vectorLiteral, topK },
        type: QueryTypes.SELECT,
      },
    );

    return rows.map((r) => r.content);
  } catch (err) {
    console.error(
      `[episodicRetrieval] Failed to retrieve episodic memory for emp ${empId}:`,
      err,
    );
    return [];
  }
}
