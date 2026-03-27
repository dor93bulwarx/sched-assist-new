# Implementation Guide: Persistent Core Memory for Autonomous Scheduling Agent

## 1. Context & Architecture Overview

You are assisting in building an autonomous scheduling AI agent using `LangGraph.js` and `TypeScript` within a Node.js Monorepo architecture.

The agent utilizes a layered memory model (working, episodic, core, and session summaries):

1. **Working Memory (session):** Managed by LangGraph's PostgreSQL checkpointer. **Session state is isolated per end user:** each person who talks with the model has **their own** conversation thread and checkpointed state. Memory from one user’s session must **not** leak into another’s—treat sessions as **separate** by design.
2. **Episodic Memory:** Managed via `pgvector` in PostgreSQL for historical semantic search. Chunks are **produced by the LLM during session summarization** (see item 4)—the same model call that generates the summary also returns the conversation **pre-split into semantically coherent chunks** suitable for embedding. **Retrieval is scoped strictly to the active user:** every query for relevant chunks must filter by **`user_id`** so results are **only** episodes and documents belonging to **that** user. Never return or rank vectors for a different `user_id`. **In addition**, for each conversation turn's **assembled context**, you **also** load **recent session summaries** from the database (see item 4 and _Recent session summaries in context_)—these are **not** a substitute for pgvector; both are injected where appropriate.
3. **Core Memory (Focus of this task):** A static `.md` file per user containing hard rules (e.g., "Works from home on Wednesdays")—also **per `user_id`**, on disk under `/data/users/{user_id}/`.
4. **Session summarization (archival + context read-back):** When a chat **ends** (TTL) or **exceeds size limits**, a **summary is written to the `summary` JSONB column** on the corresponding **`threads`** row by a **dedicated graph node**—see _Session summarization_ below. On **each** conversation's context assembly, **reload** the **two most recent** such summaries scoped to the same **`single_chat_id`** or **`group_id`** (as applicable) from the **last 48 hours** into the prompt **in addition to** pgvector hits—see _Recent session summaries in context_. This is separate from core rules and from the live Postgres checkpoint.

### Who is talking to the model? (`user_id` at the boundary)

This guide assumes that **somewhere upstream**—the **user-facing application** and its API—the caller is **identified** and a **`user_id`** (`users.id`) is attached to the request or graph invocation. **How** that identification works (auth, SSO, external directory, etc.) will be **demonstrated later** in the **interface between the user and the application**. Agent-side code here should **require** a resolved `user_id` (or load the **`users`** row via Sequelize using an ID already in state) and must **not** mix data across users.

### Storing sessions for each user (working memory)

**Working memory** for LangGraph is **persisted in PostgreSQL** by the **LangGraph Postgres checkpointer** (dedicated tables in the same DB—created via the checkpointer setup or included in migrations, depending on how you wire `@langchain/langgraph-checkpoint-postgres` / the project’s chosen adapter). That store is keyed by **`thread_id`** (plus checkpoint ids): it holds message history and graph state for **one conversation thread** at a time.

**Per user, you must never share a `thread_id` across different people.** Concretely:

1. **Checkpoint payload (automatic):** When you invoke or stream the graph, pass a **`thread_id`** in the graph configuration (e.g. LangGraph `configurable.thread_id`). The checkpointer **reads/writes** all session data for that thread **only**. Different `thread_id` ⇒ different stored session; the same user can have **multiple** threads (e.g. several chats) if you generate a new `thread_id` per chat.

2. **Linking `thread_id` ↔ `single_chat_id` / `group_id` (your schema):** The checkpointer tables **do not** replace identity or **which agent** is serving the thread. Add a **small application table** in **`@scheduling-agent/database`** (Sequelize model + migration), e.g. `threads` / `conversation_threads`, with at least:
   - `thread_id` (string/UUID, **unique**) — the same id you pass to the graph.
   - `single_chat_id` — nullable; FK to **`single_chats`** for **1:1** user↔agent conversations (see **`single_chats`** / **`agents`** in the schema reference). Resolves the **user** via **`single_chats.user_id`** and the **agent** via **`single_chats.agent_id`** → **`agents`**.
   - `group_id` — nullable; FK to **`groups`** when the session is **group-scoped** (that row’s **`groups.agent_id`** identifies the agent for the group conversation).
   - Optional: `created_at`, `updated_at`, `title`, `archived_at` for UX.
   - Optional (for summarization / TTL): `last_activity_at`, `ttl_expires_at`, `summarized_at`, `checkpoint_size_bytes` (or similar) to drive _Session summarization_ triggers.
   - `summary` (JSONB, nullable): stores the LLM-generated session summary directly in the row (see _Session summarization_).

   **Who writes the row:** Typically **`user_app`** (after auth) when starting or **resuming** a chat: it resolves **`user_id`**, **`agent_id`** (which logical agent), creates or selects a **`single_chats`** row (or **`groups`** context), allocates or reuses **`thread_id`**, **inserts or updates** the registry row with **`single_chat_id`** and/or **`group_id`**, then calls **`agent_service`** with **`thread_id`** and enough context to load **`agents.agent_identity`** and user profile data (or only `thread_id` if the agent hydrates from this table at run start—either pattern is fine if documented).

3. **Where in the repo:**
   - **Registry model + migration:** `packages/database/src/models/Thread.ts` (name as you prefer) and `packages/database/src/migrations/…`.
   - **Graph invocation:** `apps/agent_service/src/graph/index.ts` (or equivalent) — construct checkpointer against Postgres; every `invoke` / `stream` uses **`configurable: { thread_id }`** from the client.
   - **Optional helper:** `apps/agent_service/src/memory/sessionRegistry.ts` — thin wrappers that read/update session rows via Sequelize (validate **`single_chat_id`** / **`group_id`** and resolved **`user_id`** match the caller before trusting a **`thread_id`** if you expose resume-by-thread from untrusted clients).

**Do not** store full conversation text in this table; **conversation state lives in the checkpointer tables.** This table **binds** `thread_id` to **`single_chat_id`** and/or **`group_id`** (so you can list sessions per 1:1 chat, per group, resume the right thread, and audit isolation) and stores the **LLM-generated session summary** in the `summary` JSONB column when summarization runs.

### Session summarization (`summary` JSONB in `threads`)

When a **session ends** or must be **compacted**, persist a **written summarization** of that session so long-term memory and audits are not limited to the live checkpoint. Store the summary **in the `summary` JSONB column** of the **`threads`** row for that `thread_id`—**not** mixed into `core_memory.md` (which remains for durable _rules_) and **not** as files on disk.

**Triggers (configure via env / config; implement consistently):**

1. **TTL:** The session has exceeded its allowed **time-to-live** (e.g. no messages for _N_ minutes, or absolute expiry on the `threads` row). Treat as "session ended" for summarization purposes.
2. **Size threshold:** The **checkpoint / working set** for that `thread_id` is **too large** (e.g. serialized checkpoint size, message list length, or token budget)—**before** or **after** a turn, run compaction: summarize and optionally trim checkpoint per your LangGraph strategy.

**Where stored:**

The `summary` JSONB column on the **`threads`** table. The JSONB payload should contain at minimum `{ text: string, createdAt: string }` (the LLM-generated summary text and the ISO timestamp of when it was produced). Additional metadata (e.g. `messageCount`, `tokenCount`) may be included. **Only** the row for **that** `thread_id` (and thus the correct **`single_chat_id`** or **`group_id`**) is updated; never write another user’s or group’s summary to the wrong row.

**Graph responsibility — dedicated node (mandatory):** Implement a **LangGraph node** (e.g. `sessionSummarization` / `finalizeSessionSummary`) that runs when a **guard** determines TTL or size thresholds are met, or when the session **ends**. This node **must** **invoke the LLM** to produce **both** a summary **and** semantically coherent chunks for episodic storage (not placeholder text). That node should:

- Read the **conversation to summarize** from **state** (and/or checkpoint-backed messages available to the node).
- **Call the model using `llm.withStructuredOutput(schema)`** so the response is parsed into a typed object. Define a **Zod schema** (or equivalent) for the expected shape and pass it to `withStructuredOutput`; the returned object will contain:
  1. `summary` — A **session summary** (`string`, free-form text capturing the overall gist of the conversation).
  2. `chunks` — An **array of semantically coherent chunks** (`string[]`) — the model splits the conversation into logical, self-contained pieces suitable for later vector retrieval. See _LLM-driven semantic chunking_ below for chunking requirements.

  **Why `withStructuredOutput`:** The summarization node needs **both** a summary and an array of chunks from a single call. Using `withStructuredOutput` guarantees the response conforms to the schema and is parsed automatically—no manual JSON extraction or regex parsing. This pattern applies **wherever** the codebase needs structured data back from the LLM (not just summarization).
- Write the summary to the **`summary` JSONB column** on the corresponding **`threads`** row via **Sequelize** (`Thread.update()`).
- **Embed and insert** each chunk into **`episodic_memory`** (pgvector) with the correct **`user_id`**, using the project's embedding pipeline. This is **mandatory**—not a separate pipeline. Each chunk becomes one row in `episodic_memory` with `metadata` linking back to the source `thread_id`.
- Update **`Thread`** with `summarized_at` as needed so you do not double-write.

#### LLM-driven semantic chunking (for episodic insertion)

When the summarization node calls the model (via `llm.withStructuredOutput`), the prompt **must** instruct the LLM to return its `chunks` array with entries that are:

1. **Semantically self-contained:** Each chunk must make sense on its own. A reader (or a retrieval query) seeing **only** that chunk must not be misled or get a meaning opposite to the original intent. Avoid splitting mid-thought, mid-condition, or between a statement and its critical qualifier. For example, a chunk must **never** contain only _"drinking alcohol during pregnancy is necessary"_ when the full sentence is _"drinking alcohol during pregnancy is necessary **if you want to maximize the risks for the newborn**"_ — the qualifier **must** stay with the claim.
2. **Logically grouped:** Related exchanges (e.g. a full Q&A about a scheduling preference, an entire negotiation about a meeting time) should stay together in one chunk rather than being split across two.
3. **Sized for retrieval:** Each chunk should be substantial enough to carry useful context (not single-sentence fragments) but small enough that the embedding captures a focused topic. Instruct the model to aim for roughly **3–8 sentences** per chunk (adjust as needed), and to prefer more chunks over fewer if a single chunk would cover unrelated topics.
4. **Attributed:** Each chunk should include brief contextual framing (e.g. _"The user discussed rescheduling their Wednesday stand-up…"_) so that when retrieved out of order, the chunk is understandable without the surrounding conversation.

### Recent session summaries in context (read path)

For **every** conversation (each time you build the LLM context for a turn—typically inside **`contextBuilder`** or an adjacent step), you must **load and inject**:

1. **Episodic snippets** from **`pgvector`**, filtered by **`user_id`** (as already required), **and**
2. **Exactly up to two** session summaries for **the same conversation scope**: for **1:1** threads, filter by **`single_chat_id`**; for **group** threads, filter by **`group_id`**. Take the **two most recent** (by `summarized_at` timestamp) **`threads`** rows where `summary IS NOT NULL` and `summarized_at` falls within the **last 48 hours** from "now" (request time), ordered by `summarized_at DESC`, limited to 2. If **zero or one** row qualifies, inject only those; do not pull summaries for a different **`single_chat_id`** / **`group_id`**.

This **48-hour / top-two** rule is **additive** to pgvector—implement in a small helper (e.g. `sessionSummaryLoader.ts`) so isolation and ordering stay testable.

### The Docker Constraint

The system runs in Docker containers. To prevent "amnesia" when containers restart, **Core Memory** files are **NOT** stored inside application source (`/apps` or `/packages`). They live on a **mounted Docker Volume** mapped to **`/app/data`** (or equivalent) inside the container. **Session summaries** are stored in PostgreSQL (the `summary` JSONB column on `threads`), which already persists across container restarts via its own volume.

### Docker Compose and per-service Dockerfiles

Deployment is defined with **Docker Compose** (or equivalent orchestration) on top of **Dockerfiles**—one image per major runtime, not a single “fat” container for everything.

- **Separate containers:** The **MCP server** and the **scheduling agent** (`agent_service`) run in **different** containers. Each service has its own Dockerfile (for example under `apps/mcp_server/` and `apps/agent_service/`), built from the **monorepo root** context so `npm` workspaces resolve shared packages (`@scheduling-agent/types`, `@scheduling-agent/database`, etc.).
- **Typical build pattern:** Multi-stage builds—a **builder** stage copies root manifests, shared `packages/`, and the target `apps/<service>/`, runs `npm install` and workspace builds in dependency order; a **runner** stage copies only compiled output plus what is needed to `npm install --omit=dev` and start that workspace.
- **Agent container:** Mount the persistent **`/data`** volume (or equivalent) into the agent image at the path your code expects (e.g. `/app/data`) for **core memory** files, as described in _The Docker Constraint_ above.

Example shape for the **MCP server** image (adjust paths and workspace names to match this repo’s `package.json` workspaces):

```dockerfile
# --- Stage 1: Build ---
FROM node:20-alpine AS builder
WORKDIR /app

# Monorepo root config
COPY package.json package-lock.json ./
COPY tsconfig.base.json ./

# Shared packages (e.g. types, database)
COPY packages/ ./packages/

# Only the app being built
COPY apps/mcp_server/ ./apps/mcp_server/

RUN npm install
RUN npm run build --workspace=@scheduling-agent/types
RUN npm run build --workspace=@scheduling-agent/database
RUN npm run build --workspace=mcp_server

# --- Stage 2: Production ---
FROM node:20-alpine AS runner
WORKDIR /app

COPY package.json package-lock.json ./
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/apps/mcp_server/ ./apps/mcp_server/

RUN npm install --omit=dev

ENV NODE_ENV=production

CMD ["npm", "start", "--workspace=mcp_server"]
```

The **agent** Dockerfile should follow the same idea: copy and build `apps/agent_service` (and any workspaces it needs), then `CMD` that workspace’s start script. Networking between MCP and the agent (ports, env vars) belongs in **Compose** service definitions, not hard-coded into application source.

### PostgreSQL, Sequelize, and migrations

The **relational database** is **PostgreSQL**, run from the **official image** (or a pinned variant) as its own **service** in **Docker Compose**—not installed ad hoc on the host. Application services (agent, MCP, migration runners) reach it over the Compose network using the **service name** as hostname (e.g. `postgres`) and credentials supplied via **environment variables** (e.g. `DATABASE_URL` or `PGHOST` / `PGUSER` / etc.).

- **ORM:** Use **Sequelize** for access to PostgreSQL from TypeScript.
- **Schema ownership:** Database structure (tables, indexes, extensions such as `pgvector` if required) is defined and versioned in **`@scheduling-agent/database`** using **Sequelize migration files**. Run migrations as part of deploy/bootstrap (e.g. a Compose `command` or one-off job) so the DB is initialized to a known schema before the agent relies on it.
- **Separation of concerns:** Models, connection/bootstrap, and migrations live in the shared database package; **`agent_service`** imports models and types from `@scheduling-agent/database` and `@scheduling-agent/types` instead of duplicating SQL or schema.

### Database schema (reference)

Implement the following in **`packages/database`** as **Sequelize models** + **migrations**. Names and types may be adjusted (e.g. embedding dimension) but **must** preserve **`user_id` isolation** for episodic data (and core memory paths), **`thread_id` uniqueness** for session registry, and a clear link from each **`threads`** row to **which agent** (via **`single_chats`** / **`groups`** → **`agents`**).

#### Extensions (migration)

- Enable **`pgvector`**: e.g. `CREATE EXTENSION IF NOT EXISTS vector;` (use the Postgres image or stack that supports it).

#### Table: `users` (Sequelize model: `User.ts`)

Resolves **`user_id`** to a stable record for joins and lookups, and stores core identity and auth-related fields for **human users** of the app. If the product uses a bare string `user_id` without a row at first, migrations can create this table when you introduce auth integration.

| Column              | Type           | Constraints     | Notes                                      |
| ------------------- | -------------- | --------------- | ------------------------------------------ |
| `id`                | UUID or STRING | PK              | Canonical user id (`user_id` elsewhere) |
| `external_ref`      | VARCHAR        | nullable, unique| Optional SSO / external directory id             |
| `display_name`      | VARCHAR        | nullable        |                                            |
| `user_identity`     | JSONB          | nullable        | Core info about the user (e.g. `{ role, department, manager, location, timezone, startDate }`)—structured data the agent can reference for scheduling context |
| `password`          | VARCHAR        | nullable        | If present, used for local auth (hash at rest) |
| `created_at`        | TIMESTAMPTZ    | NOT NULL        |                                            |
| `updated_at`        | TIMESTAMPTZ    | NOT NULL        |                                            |

#### Table: `agents` (Sequelize model: `Agent.ts`)

**Registry of distinct agents** (multiple scheduling personalities, models, or product lines). Each **1:1** chat (**`single_chats`**) and each **group** (**`groups`**) references exactly one **`agents`** row. **`agent_identity`** is merged into the **system prompt** on every turn (via **`contextBuilder`** or equivalent).

| Column            | Type        | Constraints | Notes                                                                 |
| ----------------- | ----------- | ----------- | --------------------------------------------------------------------- |
| `id`              | UUID        | PK          | Stable agent identifier (`agent_id` elsewhere)                         |
| `name`            | VARCHAR     | NOT NULL    | Display name (e.g. "AI Default assistant — default")                 |
| `agent_identity`  | JSONB       | NOT NULL    | Structured instructions/persona injected into the system prompt each turn (e.g. `{ tone, domainFocus, toolHints }` ) — shape is product-defined |
| `created_at`      | TIMESTAMPTZ | NOT NULL    |                                                                       |
| `updated_at`      | TIMESTAMPTZ | NOT NULL    |                                                                       |

**Indexes:** optional index on **`(name)`** if you search by name.

#### Table: `single_chats` (Sequelize model: `SingleChat.ts`)

**One user’s 1:1 conversation with a specific agent** (`user_id` + `agent_id`). This is the natural scope for **`threads.single_chat_id`** when the thread is not a group thread. Resolve the **user** from **`user_id`** and **agent** from **`agent_id`** → **`agents`**.

| Column       | Type        | Constraints                              | Notes                                      |
| ------------ | ----------- | ---------------------------------------- | ------------------------------------------ |
| `id`         | UUID        | PK                                       | Use as **`single_chat_id`** on `threads` |
| `user_id`    | UUID/STRING | NOT NULL, FK → `users.id`                | Human user in this chat                    |
| `agent_id`   | UUID        | NOT NULL, FK → `agents.id`               | Agent participating in this conversation   |
| `title`      | VARCHAR     | nullable                                 | UX (e.g. chat title)                       |
| `created_at` | TIMESTAMPTZ | NOT NULL                                 |                                            |
| `updated_at` | TIMESTAMPTZ | NOT NULL                                 |                                            |

**Indexes / constraints:** optional **`UNIQUE(user_id, agent_id)`** if the product allows at most one active 1:1 chat per user per agent; index on **`(user_id)`** and **`(agent_id)`** for listing.

#### Table: `groups` (Sequelize model: `Group.ts`)

**Logical grouping** for team or shared contexts (e.g. a group chat or shared scheduling scope). Referenced by **`group_members`** and optionally by **`threads.group_id`**. **Which agent** moderates or represents the group in the UI is **`agents.id`** via **`agent_id`**.

| Column       | Type        | Constraints | Notes                                      |
| ------------ | ----------- | ----------- | ------------------------------------------ |
| `id`         | UUID        | PK          | Stable group identifier                    |
| `name`       | VARCHAR     | NOT NULL    | Display name                               |
| `agent_id`   | UUID        | NOT NULL, FK → `agents.id` | Agent for this group’s conversations |
| `created_at` | TIMESTAMPTZ | NOT NULL    |                                            |
| `updated_at` | TIMESTAMPTZ | NOT NULL    |                                            |

**Indexes:** optional index on **`(name)`** if you search by name; index on **`(agent_id)`**.

#### Table: `group_members` (Sequelize model: `GroupMember.ts`)

**Membership** of users in a group. Use this to resolve which **`user_id`** values belong to a **`group_id`** when enforcing access or loading context for group-scoped sessions.

| Column       | Type        | Constraints                              | Notes                                      |
| ------------ | ----------- | ---------------------------------------- | ------------------------------------------ |
| `id`         | UUID        | PK                                       |                                            |
| `group_id`   | UUID        | NOT NULL, FK → `groups.id`               |                                            |
| `user_id`    | UUID/STRING | NOT NULL, FK → `users.id`                | Member user                                |
| `created_at` | TIMESTAMPTZ | NOT NULL                                 |                                            |

**Indexes / constraints:** **`UNIQUE(group_id, user_id)`** so a user is not duplicated in the same group; index on **`(group_id)`** and **`(user_id)`** for lookups.

#### Table: `threads` (Sequelize model: `Thread.ts`)

**Registry + summary store:** links **`thread_id`** (LangGraph) ↔ **`single_chat_id`** and/or **`group_id`** and holds session summaries. Does **not** store full conversation text (that lives in **checkpointer** tables). **`single_chat_id`** is set for **1:1** user↔agent threads (see **`single_chats`**); **`group_id`** is set for **group** threads—typically **one** of non-null, not both, unless product rules allow hybrid. **User** for episodic/core memory is resolved via **`single_chats.user_id`** or **`group_members`** as appropriate.

| Column                   | Type        | Constraints        | Notes                                                |
| ------------------------ | ----------- | ------------------ | ---------------------------------------------------- |
| `id`                     | UUID        | PK                 | Optional surrogate; or use `thread_id` as PK         |
| `thread_id`              | VARCHAR     | UNIQUE, NOT NULL   | Same value as `configurable.thread_id`             |
| `user_id`                | UUID/STRING | nullable, FK → `users.id` | Owner user when not using **`single_chat_id`** / **`group_id`** alone (interim or simplified deployments) |
| `single_chat_id`         | UUID        | nullable, FK → `single_chats.id` | **1:1** conversation scope (user + agent via `single_chats`) |
| `group_id`               | UUID        | nullable, FK → `groups.id` | **Group** conversation scope (agent via `groups.agent_id`) |
| `title`                  | VARCHAR     | nullable           | UX                                                   |
| `created_at`             | TIMESTAMPTZ | NOT NULL           |                                                      |
| `updated_at`             | TIMESTAMPTZ | NOT NULL           |                                                      |
| `archived_at`            | TIMESTAMPTZ | nullable           | Soft-delete / archive                                |
| `last_activity_at`       | TIMESTAMPTZ | nullable           | Idle TTL, "last seen"                                |
| `ttl_expires_at`         | TIMESTAMPTZ | nullable           | Optional hard expiry                                 |
| `summarized_at`          | TIMESTAMPTZ | nullable           | When the **session summary** was last written to `summary` |
| `summary`               | JSONB       | nullable           | LLM-generated session summary; e.g. `{ text: string, createdAt: string }` with optional extra metadata |
| `checkpoint_size_bytes`  | BIGINT      | nullable           | Optional estimate for **size-threshold** summarization |

**Indexes:** `UNIQUE(thread_id)`; index on **`(user_id)`**, **`(single_chat_id)`**, and **`(group_id)`** as applicable; optional **`(single_chat_id, summarized_at DESC)`** and **`(group_id, summarized_at DESC)`** for recent summaries; optional **`(user_id, summarized_at DESC)`** when **`user_id`** is populated; optional **`(single_chat_id, updated_at DESC)`** / **`(group_id, updated_at DESC)`** / **`(user_id, updated_at DESC)`** for listing threads.

#### Table: `episodic_memory` (Sequelize model: `EpisodicMemory.ts`)

**Episodic / semantic search** using **`pgvector`**. Rows are inserted by the **session summarization node** — the LLM produces semantically coherent chunks during summarization, which are then embedded and stored here. **Every read query must include `WHERE user_id = ?`.**

| Column      | Type           | Constraints  | Notes                                                                 |
| ----------- | -------------- | ------------ | --------------------------------------------------------------------- |
| `id`        | UUID           | PK           |                                                                       |
| `user_id`   | UUID/STRING    | NOT NULL, FK → `users.id` | **Mandatory scope**; never return another user's rows             |
| `content`   | TEXT           | NOT NULL     | Semantically self-contained text chunk (produced by LLM during summarization) |
| `embedding` | `vector(N)`    | NOT NULL     | `N` = model dimension (e.g. 1536—**must** match embedding pipeline)     |
| `metadata`  | JSONB          | nullable     | Source `thread_id`, chunk index, `summarized_at` timestamp, etc.        |
| `created_at`| TIMESTAMPTZ    | NOT NULL     |                                                                       |

**Indexes:** **`(user_id)`**; index suitable for **vector similarity** (e.g. **HNSW** or **IVFFlat** on `embedding`) **plus** always filter by **`user_id`** in application queries (composite or scoped queries as recommended by `pgvector`).

#### LangGraph Postgres checkpointer (library tables)

**Working memory** (serialized graph state, messages per **`thread_id`**). Table names and columns are defined by **`@langchain/langgraph-checkpoint-postgres`** (or the adapter you use)—apply the **official** migration/setup for that package version. Do **not** treat checkpoint rows as authoritative for **user identity or agent choice**; use **`threads`** (and joins to **`single_chats`** / **`groups`** / **`agents`**).

##### What `@langchain/langgraph-checkpoint-postgres` does (and does not)

**Provided by the library**

- **Persists checkpoints** to PostgreSQL: each checkpoint is a **snapshot** of graph state (serialized channels—typically including **`messages`**) at a point in time.
- **Keyed by `thread_id`**: all checkpoints for one conversation share the same **`thread_id`**; the library may store **multiple** checkpoints per thread (history / versions), depending on version and usage.
- **Per run:** when you **`invoke`** or **`stream`** with **`configurable.thread_id`** set, the runtime **loads** the latest checkpoint for that thread, **executes** the graph in memory, then **writes** one or more new checkpoints. You do **not** call a separate “load checkpoint” API for normal flows—the **passing of `thread_id`** is what ties the run to persisted state.
- **Survives restarts** and supports multiple app instances sharing one database.

**Not provided by the library (you implement)**

- **Which `thread_id` to use** for this request: **new chat** → generate a new id and insert **`threads`**; **continue** → reuse the id from the client/session/DB; **“resume last”** → query **`threads`** by **`single_chat_id`** or **`group_id`** (or join from **`user_id`** through **`single_chats`**). The checkpointer does **not** infer user identity or agent.
- **`single_chat_id` / `group_id` ↔ `thread_id`** mapping: only **`threads`** (or equivalent)—checkpoint tables are **not** the source of truth for **who** is chatting or **which agent** applies.
- **TTL**, **idle expiry**, and **checkpoint/message size limits**: **application logic** (guards, config, **`threads`** fields like `last_activity_at` / `checkpoint_size_bytes`). When a threshold is exceeded, you **must** run the **session summarization path**—this is **not** optional.
- **Session summarization** (writing to the **`summary` JSONB column** on **`threads`** **and** inserting chunks into **`episodic_memory`**): a **mandatory LangGraph node** that **invokes the LLM** to produce both summary text and semantically coherent chunks, then persists via **Sequelize**—not the checkpoint package. **Core memory** files are separate (your nodes + **`fs`**).

##### `thread_id` vs checkpoint records

- **`thread_id`**: a **string identifier** for **one conversation** (e.g. UUID). You pass it on every turn. It is **not** the large payload; it is the **key** that groups checkpoint rows.
- **Checkpoint**: the **actual persisted object** (rows/blobs in the library’s tables) holding state data. **Checkpoints** store the data; **`thread_id`** selects **which** conversation’s chain to load and extend.

A **graph run ending** does **not** invalidate **`thread_id`**: the next user message should use the **same** **`thread_id`** unless the product starts a **new** conversation (new id). **Interrupts** / human-in-the-loop also keep the same **`thread_id`** when resuming.

##### Trim, reset, and “active” threads

| Idea | Who owns it | Notes |
| ---- | ----------- | ----- |
| **Trim** | **You** | Shrink in-graph state (e.g. replace long **`messages`** with summary + recent turns) so the **next** checkpoint is smaller. Implement as graph nodes / state updates—not automatic from the library. |
| **Reset** (clear working memory for a thread) | **Library (partial)** + **you** | Prefer the checkpointer’s **documented** APIs to **delete** or **clear** checkpoints for a **`thread_id`** (exact methods depend on package version)—avoid ad hoc SQL against library tables. **Or** stop using an old **`thread_id`**, create a **new** one, and mark the old row archived in **`threads`**. |
| **“Active” conversation** | **You** | LangGraph does not expose a first-class “active” flag; use **`threads`** (`archived_at`, etc.) and which **`thread_id`** you pass on the next request. |

##### Typical request flow (each user message)

1. Resolve **`user_id`**, **`agent_id`** (which logical agent), and create/select **`single_chats`** or **`groups`** as needed (auth / boundary layer).
2. Resolve or create **`thread_id`** and **`threads`** row (with **`single_chat_id`** and/or **`group_id`**).
3. **Mandatory guard:** evaluate **TTL** and **size** thresholds (config + **`threads`** / state). If either threshold is exceeded, you **must** execute the **session summarization** flow **before** continuing: a **dedicated graph node** that **calls the model** to generate both the summary text and semantically coherent chunks, writes the summary to the **`summary` JSONB column** on the **`threads`** row (and sets `summarized_at`), embeds and inserts the chunks into **`episodic_memory`** with `user_id`, then applies your **compaction / trim / new-thread** policy as designed. This is **not** automatic from the checkpointer—**omitting summarization when thresholds fire is incorrect. Compaction/new-thread steps beyond summarization follow your product rules.
4. Call **`invoke` / `stream`** with **`configurable.thread_id`** so checkpoints load/save for that thread (for the normal turn, or after the summarization path has completed as required).

**Concurrency:** two concurrent requests with the **same** **`thread_id`** can race; **serialize** updates per thread or use a queue if needed.

#### Not stored in Postgres (this architecture)

| Artifact              | Location                                                                 |
| --------------------- | ------------------------------------------------------------------------ |
| Core rules markdown   | Volume: `/data/users/{user_id}/core_memory.md`                        |

> **Note:** Session summaries **are** stored in Postgres, in the `summary` JSONB column on `threads`. They do **not** use on-disk files.

---

## 2. Directory Structure & Workspaces

Your generated code must align with this layout. **Primary focus for the deliverables in this guide:** `/apps/agent_service`. Other paths show how the same principles fit together across the monorepo.

**How this tree maps to the principles**

| Principle                                            | Where it lives                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`user_id` at the user ↔ app boundary**              | `apps/user_app` (or your BFF/API gateway name)—authenticates and **attaches `user_id`** to requests / graph invocations (details demonstrated later).                                                                                                                                   |
| **Per-user session (working memory / checkpointer)** | LangGraph **Postgres checkpointer** (same DB) keyed by **`thread_id`**; **`thread_id` ↔ `single_chat_id` / `group_id`** in a Sequelize **registry table** in `packages/database` (see _Storing sessions for each user_). Wired in `agent_service/src/graph` + `user_app` when starting/resuming a chat. |
| **Episodic `pgvector` (always filter by `user_id`)**  | Sequelize models + migrations in `packages/database`; retrieval in `agent_service/src/memory/episodicRetrieval.ts` (queries **only** with `user_id`, resolved via **`single_chats`** or group membership).                                                                                                                                   |
| **Recent session summaries (48h window)**            | `sessionSummaryLoader.ts` (or equivalent): for each turn, query **`threads`** for **up to 2** newest summaries (where `summary IS NOT NULL` and `summarized_at` within **last 48 hours**) scoped by **`single_chat_id`** or **`group_id`**; merge into context **together with** pgvector—see _Recent session summaries in context_. |
| **Agent identity in prompt**                         | Load **`agents.agent_identity`** (JSONB) for the active **`agent_id`** (from **`single_chats`** or **`groups`**) and merge into the system prompt each turn—typically in **`contextBuilder`**.                                                                                                                                                                                                                    |
| **Core memory `.md` on disk**                        | `coreMemoryManager.ts` + mounted `/data` (not in git).                                                                                                                                                                                                                                 |
| **Session summarization (TTL / size)**               | **Mandatory** `graph/nodes/sessionSummarization.ts` (or similar): **single LLM call** produces summary + semantically coherent chunks → writes `summary` JSONB to `threads` **and** embeds + inserts chunks into `episodic_memory`. Triggered when **TTL** or **checkpoint size** threshold is exceeded—see _Session summarization_ and _Typical request flow_. |
| **MCP vs agent processes**                           | Separate apps: `apps/mcp_server` and `apps/agent_service`, each with its own Dockerfile.                                                                                                                                                                                               |
| **Postgres + migrations**                            | `packages/database` migrations; DB service in Compose at repo root.                                                                                                                                                                                                                    |

/scheduling*agent_workspace (Monorepo Root)
├── docker-compose.yml # postgres (+ pgvector image or init), agent_service, mcp_server, volumes, env; migration bootstrap optional
├── package.json # npm workspaces (root)
├── tsconfig.base.json
│
├── /apps
│ ├── /user_app # User-facing app / API: identifies caller → passes user_id into agent (interface TBD; not part of core-memory deliverables here)
│ │ └── /src
│ │ └── (routes, auth, client to agent_service — attach user_id, agent_id, single_chat/group context per session/thread)
│ │
│ ├── /mcp_server # MCP server container (own Dockerfile; see §1)
│ │ ├── Dockerfile
│ │ └── /src
│ │ └── ...
│ │
│ └── /agent_service # Scheduling LangGraph agent (own Dockerfile) — **you are coding here** for this guide
│ ├── Dockerfile
│ └── /src
│ ├── /graph
│ │ ├── index.ts # compile graph, Postgres checkpointer; invoke/stream with configurable.thread_id
│ │ ├── contextBuilder.ts
│ │ └── /nodes
│ │ ├── ... # (mirror graphs-example style)
│ │ └── sessionSummarization.ts # runs when session ends (TTL/size); LLM produces summary + chunks → writes threads + episodic_memory
│ ├── state.ts # LangGraph state shape; MUST include user_id and agent_id (or resolvable from single_chat_id — set when thread starts from user_app)
│ ├── /memory
│ │ ├── coreMemoryManager.ts # core_memory.md under /data/users/{user_id}/
│ │ ├── episodicRetrieval.ts # loads relevant pgvector chunks — queries MUST filter by user_id only
│ │ ├── sessionSummaryLoader.ts # queries threads for up to 2 newest summaries in last 48h (single_chat_id / group_id)
│ │ ├── sessionRegistry.ts # optional: helpers to read/validate thread_id ↔ single_chat_id / group_id via @scheduling-agent/database
│ │ └── sessionSummaryWriter.ts # optional: writes summary JSONB to threads via Sequelize (called from summarization node)
│ └── /tools
│ └── editCoreMemoryTool.ts
│
├── /packages
│ ├── /types # Shared types ('@scheduling-agent/types')
│ │ └── /src/index.ts
│ │
│ └── /database # Shared DB package ('@scheduling-agent/database')
│ ├── /src/models
│ │ ├── Thread.ts # registry + summary: thread_id ↔ single_chat_id / group_id, summary JSONB (working-memory sessions; not the checkpoint blobs)
│ │ ├── EpisodicMemory.ts # episodic rows/chunks; schema MUST support user_id for isolation + vector column(s)
│ │ ├── User.ts # users table
│ │ ├── Agent.ts # agents registry + agent_identity JSONB
│ │ ├── SingleChat.ts # single_chats: 1:1 user ↔ agent
│ │ ├── Group.ts # groups table (+ agent_id)
│ │ └── GroupMember.ts # group_members junction
│ ├── /src/migrations # Sequelize migrations: Postgres + extensions (e.g. vector), users, agents, single_chats, groups, group_members, threads, checkpointer tables if not created by lib, episodic tables
│ └── /src/connection.ts # Sequelize init; env from Compose
│
└── core_memory.md

`episodicRetrieval.ts`, `sessionSummarization` / `sessionSummaryWriter`, `user_app`, and the full `graph/index.ts` wiring may be implemented in later milestones; the structure above still applies so **session**, **session summaries (in DB)**, **episodic (`user_id`)**, and **core file** concerns stay in separate, obvious places.

### Reference implementation (`graphs-example/`)

**Important:** The code under `graphs-example/` is **not** this scheduling project. It comes from a **completely different** product and problem domain. Do **not** copy its business logic, naming, or domain concepts into the scheduling agent.

It is included **only** as a **structural and readability reference**: how to organize graphs, nodes, tools, and related functions so the codebase stays clear and consistent. Before implementing graphs, nodes, or tools here, **skim those files** for layout, patterns, and typing—not for subject matter.

| Area                                     | Example file(s)                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| **Graph** (compile, routing, subgraphs)  | `graphs-example/identifyVulnerabilities.ts`, `graphs-example/validationGraph.ts` |
| **Nodes**                                | `graphs-example/nodes/vulnerabilityNodes.ts`                                     |
| **Tools** (`@tool`, schemas, invocation) | `graphs-example/tools/insertMemoryTool.ts`                                       |
| **State**                                | `graphs-example/state.ts`                                                          |

Use them to mirror **structure, typing, and layering** for this repo’s scheduling components—not as copy-paste boilerplate and not as a model of _what_ the agent should do, only _how_ similar pieces are built.

---

## 3. Objective

Write the robust TypeScript implementation for the Core Memory management. This includes:

1. A File System utility class/functions to safely read and write to the mounted volume.
2. A LangChain/LangGraph `@tool` (`editCoreMemory`) that the AI agent can invoke to update these files autonomously.
3. A **real** Context Builder in `contextBuilder.ts` that loads core memory from disk, pulls **episodic** context via **`pgvector`** (for `user_id`), loads **`agents.agent_identity`** for the active agent, loads **up to two** recent session summaries from **`threads`** (JSONB `summary` column) per _Recent session summaries in context_, and uses **Sequelize** where needed to resolve **user** / **single_chat** / **group** / **agent** context—then injects the combined instructions into the LLM prompt—aligned with patterns in `graphs-example/`, not a stub or placeholder.

---

## 4. Technical Requirements & Constraints

- **Language:** TypeScript (Node.js).
- **File System:** Use native Node.js `fs/promises` or `fs`.
- **Graceful Handling:** The code MUST handle cases where the directory (`/app/data/users/{user_id}`) or `core_memory.md` does not exist yet. Create missing directories automatically before writes. Session summaries are read from the database and do not require filesystem handling.
- **Tool Interface:** The `editCoreMemory` tool must support at least two actions:
  - `append`: Adds a new rule to the end of the file.
  - `rewrite`: Replaces the entire content of the file (useful if the agent needs to delete or heavily modify rules).
- **Strict Layering:** Assume types (like `UserId`) are imported from `@scheduling-agent/types`. Do not redefine database models here.
- **Database:** PostgreSQL is provided by Docker Compose. Use **Sequelize** in `@scheduling-agent/database`; **do not** embed raw DDL in the agent app. Schema changes belong in **Sequelize migrations** in that package. The agent reads connection settings from environment variables wired in Compose. **Canonical tables and columns:** see **Database schema (reference)** under §1.
- **Per-user isolation:** **Working memory** must remain **separate per user** (one session / thread per conversing user—no shared checkpoint state across users). **Episodic retrieval** over **`pgvector`** must include a **hard filter on `user_id`** so embedded chunks are **only** those belonging to the user currently talking to the agent. Implementations that omit this filter are incorrect.
- **Context assembly (per turn):** The LLM context must combine **(a)** **`pgvector`** episodic snippets for **`user_id`**, **(b)** **up to two** session summaries scoped to the active **`single_chat_id`** or **`group_id`** from the **last 48 hours** (newest first, from the `summary` JSONB column on `threads`), **(c)** **`agents.agent_identity`** (JSONB) for the active agent, and **(d)** core memory and other nodes as designed. **(a)**, **(b)**, and **(c)** are all part of the intended prompt assembly; **(b)** is loaded from **`threads`** only, not from pgvector.
- **Sessions:** Persist LangGraph state with the **Postgres checkpointer** using a distinct **`thread_id` per conversation**; store **`thread_id` ↔ `user_id`** (and/or **`single_chat_id` / `group_id`** when those tables exist) in the **`threads`** table (`Thread` model in `@scheduling-agent/database`). Do not reuse the same `thread_id` across different users in a way that breaks isolation.
- **LangGraph checkpointer vs app logic:** Checkpoint **save/load** is handled by **`@langchain/langgraph-checkpoint-postgres`** when you pass **`thread_id`**; **TTL**, **size guards**, **trim/reset** policy, **`user_id`** / **`agent_id`** resolution (via **`single_chats`** / **`groups`**), and the **mandatory LLM summarization node** when thresholds fire are **application** concerns—see **What `@langchain/langgraph-checkpoint-postgres` does (and does not)** under §1 (Database schema).
- **Session summarization:** When a session **ends** or **TTL** / **size** thresholds are exceeded, a **mandatory graph node** must **invoke the LLM** (via `withStructuredOutput`) to produce **both** summary text **and** an array of semantically coherent chunks (see _LLM-driven semantic chunking_ under §1). The summary is written to the **`summary` JSONB column** on the corresponding **`threads`** row (and set `summarized_at`); the chunks are embedded and inserted into **`episodic_memory`** with the correct `user_id`. Do not store these summaries inside `core_memory.md`; keep rules and session archives separate. Implement **TTL** and **size** thresholds via config and/or `threads` row metadata. **Skipping LLM summarization when a threshold fires is incorrect.**
- **Structured LLM output:** Whenever the application needs **structured data** back from the LLM (not free-form chat), use **`llm.withStructuredOutput(schema)`** with a **Zod schema** describing the expected shape. Do **not** ask the model to return JSON in a plain `invoke` call and then manually parse it—`withStructuredOutput` handles validation and parsing automatically. This applies to session summarization (summary + chunks), and to any future node or tool that requires a typed response from the model.

---

## 5. Required Deliverables

Please generate the following TypeScript files based on the architecture:

### Deliverable A: `src/memory/coreMemoryManager.ts`

Write a utility module with two exported functions:

- `getCoreMemory(userId: string): Promise<string>` - Reads the markdown file. Returns a default string (e.g., "No specific core preferences set.") if the file doesn't exist.
- `updateCoreMemory(userId: string, action: 'append' | 'rewrite', content: string): Promise<boolean>` - Writes to the file. Ensures the directory tree exists before writing.

### Deliverable B: `src/tools/editCoreMemoryTool.ts`

Wrap the `updateCoreMemory` function into a LangChain Dynamic Structured Tool (`DynamicStructuredTool` or `@tool` decorator).

- Include a highly descriptive `description` so the LLM knows _exactly_ when to use it (only for permanent preferences, not one-time events).
- Use `zod` for the input schema (`userId`, `action`, `content`).

### Deliverable C: `src/graph/contextBuilder.ts`

Implement a **production-style** context builder (not a mock): an async function (or small module) fit for use as a **LangGraph node** or as a helper invoked from one, following the same structural style as `graphs-example/`.

It must:

1. **Resolve the active user** and **agent** from **`user_id`**, **`agent_id`**, and/or **`single_chat_id`** / **`group_id`** already carried in graph state (set by the **user ↔ application** layer when a thread starts—see _Who is talking to the model?_ above) and/or **`@scheduling-agent/database`** Sequelize models—using real imports and types, assuming migrations have created the needed tables. **Load `agents.agent_identity`** for the active agent and merge it into the system prompt. Do not infer identity from free text alone.
2. Call **`getCoreMemory(userId)`** from `coreMemoryManager.ts` and incorporate the returned markdown into the **system** / developer instructions string passed to the LLM (prepend or clearly delimit so the model treats it as durable preferences).
3. Load **episodic** context for **`user_id`** via **`episodicRetrieval.ts`** (pgvector, **hard `user_id` filter**) and load **up to two** session summaries for the active **`single_chat_id`** or **`group_id`** from the **last 48 hours** via **`sessionSummaryLoader.ts`** (or inline equivalent, querying `threads` for rows with `summary IS NOT NULL` and `summarized_at` within 48h), per _Recent session summaries in context_. Merge **`agents.agent_identity`** into the system instructions for the resolved **`agent_id`**. These pieces are **in addition** to each other.
4. Handle missing or empty core memory, no qualifying session summaries, or empty episodic results gracefully (clear defaults or omitted sections).
5. Remain **testable and side-effect bounded**: file I/O for core memory **reads** via the dedicated memory helpers; DB access only through the shared package's models for episodic and session-summary queries—no ad hoc SQL strings in this file.

---

## 6. Coding Standards

- Write clean, self-documenting code.
- Use `try/catch` blocks for file system operations to prevent unhandled promise rejections that could crash the agent's container.
- Add minimal, descriptive comments explaining the Docker volume awareness (e.g., "Points to the mounted volume path") for **`core_memory.md`** and the database-backed nature of session summaries.
