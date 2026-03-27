import { RunnableConfig } from "@langchain/core/runnables";
import { Employee } from "@scheduling-agent/database";
import type {
  AssembledContext,
  EmployeeIdentity,
  SessionSummary,
} from "@scheduling-agent/types";

import { getCoreMemory } from "../../memory/coreMemoryManager";
import { retrieveEpisodicMemory } from "../../memory/episodicRetrieval";
import { loadRecentSessionSummaries } from "../../memory/sessionSummaryLoader";
import { embedText } from "../../memory/embeddings";
import { SchedulerAgentState } from "../../state";

/**
 * Builds the complete LLM context for one conversation turn.
 *
 * This function is designed to be called from a LangGraph node (or as a
 * helper inside one), following the same structural pattern as the nodes
 * in `graphs-example/nodes/vulnerabilityNodes.ts`.
 *
 * It assembles three layers — core memory, episodic snippets, and recent
 * session summaries — all scoped strictly to `emp_id`, then formats them
 * into a system prompt that the model receives as durable instructions.
 */
export async function buildContext(
  state: SchedulerAgentState,
  _config: RunnableConfig,
): Promise<AssembledContext> {
  const { empId, userInput } = state;

  // ── 1. Resolve employee identity (optional enrichment) ─────────────
  let employeeIdentity: EmployeeIdentity | null = null;
  try {
    const employee = await Employee.findByPk(empId);
    if (employee?.employeeIdentity) {
      employeeIdentity = employee.employeeIdentity;
    }
  } catch {
    // Employee table may not be populated yet — proceed without identity.
  }

  // ── 2. Core memory (on-disk markdown) ──────────────────────────────
  const coreMemory = await getCoreMemory(empId);

  // ── 3. Episodic snippets (pgvector, hard emp_id filter) ────────────
  let episodicSnippets: string[] = [];
  if (userInput) {
    const queryEmbedding = await embedText(userInput);
    episodicSnippets = await retrieveEpisodicMemory(empId, queryEmbedding);
  }

  // ── 4. Recent session summaries (last 48h, max 2) ─────────────────
  const recentSessionSummaries = await loadRecentSessionSummaries(empId);

  // ── 5. Assemble system prompt ──────────────────────────────────────
  const systemPrompt = formatSystemPrompt(
    coreMemory,
    episodicSnippets,
    recentSessionSummaries,
    employeeIdentity,
  );

  return {
    coreMemory,
    episodicSnippets,
    recentSessionSummaries,
    employeeIdentity,
    systemPrompt,
  };
}

/**
 * LangGraph node that assembles context and writes the system prompt
 * into state.  Suitable for use with `graph.addNode("assembleContext", contextBuilderNode)`.
 */
export async function contextBuilderNode(
  state: SchedulerAgentState,
  config: RunnableConfig,
): Promise<Partial<SchedulerAgentState>> {
  if (state.error) return {};

  try {
    const ctx = await buildContext(state, config);

    return {
      systemPrompt: ctx.systemPrompt,
      contextAssembled: true,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown context-builder error";
    console.error("[contextBuilder]", message);
    return { error: message };
  }
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

function formatSystemPrompt(
  coreMemory: string,
  episodicSnippets: string[],
  recentSummaries: SessionSummary[],
  identity: EmployeeIdentity | null,
): string {
  const sections: string[] = [];

  sections.push(
    "You are a helpful AI scheduling assistant. " +
      "Use the following context about the employee to inform your responses.\n",
  );

  // Identity
  if (identity) {
    sections.push("## Employee Profile");
    const pairs = Object.entries(identity)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `- **${k}:** ${v}`);
    if (pairs.length > 0) {
      sections.push(pairs.join("\n"));
    }
    sections.push("");
  }

  // Core memory (durable rules)
  sections.push("## Core Scheduling Preferences");
  sections.push(coreMemory);
  sections.push("");

  // Recent session summaries
  if (recentSummaries.length > 0) {
    sections.push("## Recent Conversation Summaries (last 48 hours)");
    for (const s of recentSummaries) {
      sections.push(`- [${s.createdAt}] ${s.text}`);
    }
    sections.push("");
  }

  // Episodic snippets
  if (episodicSnippets.length > 0) {
    sections.push("## Relevant Past Context");
    for (const snippet of episodicSnippets) {
      sections.push(`- ${snippet}`);
    }
    sections.push("");
  }

  return sections.join("\n");
}
