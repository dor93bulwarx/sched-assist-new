import { OpenAIEmbeddings } from "@langchain/openai";

/**
 * Shared OpenAI embedding model instance.
 *
 * Uses `text-embedding-3-small` (1536 dimensions) — must match the
 * EMBEDDING_DIMENSION constant in the EpisodicMemory model and the
 * pgvector column created by migrations.
 */
const embeddingModel = new OpenAIEmbeddings({
  modelName: "text-embedding-3-small",
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Embeds a single text string and returns its vector representation.
 * Used by episodic retrieval (query embedding) and session summarization
 * (chunk embedding).
 */
export async function embedText(text: string): Promise<number[]> {
  return embeddingModel.embedQuery(text);
}

/**
 * Embeds multiple text strings in a single batched API call.
 * More efficient than calling `embedText` in a loop when you have
 * several chunks to embed at once (e.g. during session summarization).
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  return embeddingModel.embedDocuments(texts);
}
