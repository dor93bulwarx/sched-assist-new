import { AgentSession, EpisodicMemory } from "@scheduling-agent/database";
import type { EmployeeId, SessionSummary } from "@scheduling-agent/types";
//לא לשכוח אחר כך להוסיף שבמידה וחוזרת תשובה מהוקטור סטור ששייכת לקובץ session שגם ככה נשלח לקונטקסט לא להוסיף את אותו צאנק לקונטקסט כדי למנוע כפילויות
/**
 * Persists the session summary to the `agent_sessions` row and inserts
 * semantically coherent chunks into `episodic_memory`.
 *
 * Called from the sessionSummarization graph node after the LLM produces
 * the structured output (summary + chunks).
 *
 * @param threadId   - Identifies the session row to update.
 * @param empId      - Owner employee; written to every episodic row.
 * @param summary    - Free-form summary text from the LLM.
 * @param chunks     - Semantically self-contained text chunks from the LLM.
 * @param embedChunk - Callback that turns a text chunk into an embedding vector.
 */
export async function persistSummarizationResult(
  threadId: string,
  empId: EmployeeId,
  summary: string,
  chunks: string[],
  embedChunk: (text: string) => Promise<number[]>,
): Promise<void> {
  const now = new Date();
  const summaryPayload: SessionSummary = {
    text: summary,
    createdAt: now.toISOString(),
    messageCount: undefined,
  };

  // Write summary JSONB to the agent_sessions row.
  await AgentSession.update(
    {
      summary: summaryPayload,
      summarizedAt: now,
    },
    { where: { threadId } },
  );

  // Embed each chunk and insert into episodic_memory (all scoped to emp_id).
  for (let i = 0; i < chunks.length; i++) {
    const embedding = await embedChunk(chunks[i]);

    await EpisodicMemory.create({
      empId,
      content: chunks[i],
      embedding,
      metadata: {
        threadId,
        empId,
        chunkIndex: i,
        summarizedAt: now.toISOString(),
      },
    });
  }
}
