// ─── Employee ────────────────────────────────────────────────────────────────

/** Canonical employee identifier used across the system. */
export type EmployeeId = string;

/** Structured identity data stored in the `employee_identity` JSONB column. */
export interface EmployeeIdentity {
  role?: string;
  department?: string;
  manager?: string;
  location?: string;
  timezone?: string;
  startDate?: string;
  [key: string]: unknown;
}

// ─── Agent Sessions ──────────────────────────────────────────────────────────

/** Shape of the `summary` JSONB column on `agent_sessions`. */
export interface SessionSummary {
  text: string;
  createdAt: string;
  messageCount?: number;
  tokenCount?: number;
}

/** Attributes exposed by the AgentSession Sequelize model. */
export interface AgentSessionAttributes {
  id: string;
  threadId: string;
  empId: EmployeeId;
  title?: string | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date | null;
  lastActivityAt?: Date | null;
  ttlExpiresAt?: Date | null;
  summarizedAt?: Date | null;
  summary?: SessionSummary | null;
  checkpointSizeBytes?: number | null;
}

// ─── Episodic Memory ─────────────────────────────────────────────────────────

/** Metadata stored alongside each episodic chunk. */
export interface EpisodicChunkMetadata {
  threadId?: string;
  chunkIndex?: number;
  summarizedAt?: string;
  [key: string]: unknown;
}

/** Attributes exposed by the EpisodicMemory Sequelize model. */
export interface EpisodicMemoryAttributes {
  id: string;
  empId: EmployeeId;
  content: string;
  embedding: number[];
  metadata?: EpisodicChunkMetadata | null;
  createdAt: Date;
}

// ─── Employee Attributes ─────────────────────────────────────────────────────

export interface EmployeeAttributes {
  id: EmployeeId;
  externalRef?: string | null;
  displayName?: string | null;
  employeeIdentity?: EmployeeIdentity | null;
  password?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Core Memory ─────────────────────────────────────────────────────────────

/** The two actions supported by the editCoreMemory tool. */
export type CoreMemoryAction = "append" | "rewrite";

// ─── Context Builder ─────────────────────────────────────────────────────────

/** The assembled context injected into the LLM prompt each turn. */
export interface AssembledContext {
  coreMemory: string;
  episodicSnippets: string[];
  recentSessionSummaries: SessionSummary[];
  employeeIdentity: EmployeeIdentity | null;
  systemPrompt: string;
}

// ─── Session Summarization ───────────────────────────────────────────────────

/** Schema returned by the LLM during session summarization (withStructuredOutput). */
export interface SessionSummarizationResult {
  summary: string;
  chunks: string[];
}
