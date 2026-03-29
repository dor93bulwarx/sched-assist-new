Long-run thread state, agreed remediation, and UI display

This document follows the discussion arc: (1) the problem with today’s model, (2) the solution we aligned on for execution, (3) the mandatory display-layer adjustment so chat UI stays coherent when thread_id rotates.



1. Problem: long-run messages state with an unreplaced thread_id (today)

LangGraph state: messages use an append-only reducer (state.ts: [...state, ...update]). Nothing in graph nodes removes prior messages after summarization—sessionSummarization.ts persists summary to DB but returns {} and does not truncate state.

Per turn: callModel.ts passes full state.messages to the LLM—no sliding window in code.

Checkpointing: executeChatTurn.ts always uses configurable: { thread_id: threadId }. LangGraph does not replace thread_id; the same application UUID maps to one checkpoint chain until you change it.

Risks over months/years: unbounded checkpoint growth, context-window / cost blowups, slower loads. Same thread id for life is therefore workable only if you bound state another way; today’s code does not bound messages in checkpoint state.



2. Agreed solution (execution / agent layer)

Goal: Bound LangGraph execution per segment: after summarize (or similar threshold), use a new thread_id for new checkpoints, carry summary text into the next segment’s context (e.g. last one or two segment summaries), and clear or start fresh message state for that segment so the model does not replay the full history.

Canonical “head” thread for a conversation





Infer newest segment by **created_at / row insert time** per group_id / single_chat_id (tie-break id), or maintain an explicit **active_thread_id** on groups / single_chats. Do not use updated_at to rank segments—it moves on every activity.



Enforce at most one intentional chain per conversation (constraints / dedupe) so “newest” is unambiguous.

Worker (agentChat.worker.ts) and locking





Resolve canonical thread id for the job’s groupId / singleChatId (newest segment). If the job’s threadId is stale, rewrite to the canonical id for ensureSession + graph.invoke.



Then acquire the lock on the resolved id or on a conversation-scoped Redis key—never only on the raw client-supplied threadId, or two workers can lock different keys for the same chat (threadLock).

Socket push of new thread_id to all group members





Optional for correctness if every chat path resolves canonical thread server-side: stale body threadId still works.



Socket remains useful for UX (sidebar/session refresh) but is not required to accept messages.

Lifecycle note: Summarization today runs inside the graph; rotating id implies refactoring where rotation is committed (finish segment T₁ → create T₂ → subsequent invokes use thread_id: T₂). Exact ordering is an implementation detail; the important contract is execution keyed by resolvable canonical thread + bounded checkpoint per segment.



3. Required adjustment: how messages are shown in the UI (conversation-scoped, not thread-scoped)

Why this is separate from §2: HistoryService today loads UI history from **graph.getState({ thread_id })** only—one checkpoint per threadId. After rotation, T₁ and T₂ are different checkpoints; thread-keyed history splits the transcript unless you merge many checkpoints (fragile) or never rotate display source.

Agreed approach: Conversation-scoped persistence for what users read:





Add an append-only table (name e.g. conversation_messages) keyed by **group_id OR single_chat_id** (exactly one set per row), with role, content, sender fields, created_at, optional thread_id for audit.



Write rows whenever a message is “real” for the transcript: user message accepted, assistant reply completed (include store-only group paths if they should appear).



History / search APIs accept **groupId / singleChatId** + pagination—not primary scrollback by threadId.



Client (ChatPage.tsx): load history via conversation-scoped endpoints; stop using **getHistory(session.threadId)** as the only source of truth for the visible list once this exists (today: [api getHistory(threadId)](c:\Users\momi9\Dev\dorclaw\schedassistant\apps\user_app\client\src\api\index.ts)). Live sockets (group:user-message, chat:reply) can still append in memory; reload must match the same conversation stream.

Principle: **thread_id** = LangGraph execution segment; conversation id = product transcript. Rotation changes the former; the latter stays one continuous timeline.

Alternatives (weaker): merge checkpoints by walking a thread chain (Option B in earlier notes)—more error-prone. Not sufficient: server-side canonical thread for send only—does not fix read without §3.



Reference: current request flow (unchanged until implementation)





Send: HTTP POST /api/chat with threadId → chat.controller → agent enqueue → worker → socket chat:reply with same threadId for that job.



New thread id minted: only in SessionsService.createSession (crypto.randomUUID()), then ensureSession.



Appendix: prior edge cases (duplicate threads, client bootstrap)





Multiple threads rows per group_id/single_chat_id are possible today (no unique constraint); fix as part of canonical-head work.



ChatPage useEffect vs handleSend both calling createSession can race; get-or-create session helps.

Implementation work is out of scope here until explicitly scheduled.