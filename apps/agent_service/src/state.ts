import { Annotation } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";

/**
 * LangGraph state annotation for the scheduling agent.
 *
 * `empId` is set once when the thread is created (by the user-facing
 * application layer) and carried through every node so that memory
 * retrieval, core-file I/O, and session isolation can always scope to
 * the correct employee without re-resolving identity.
 */
export const SchedulerAgentAnnotation = Annotation.Root({
  /** The employee who owns this conversation thread. */
  empId: Annotation<string>,

  /** The LangGraph thread_id for this conversation (mirrors configurable.thread_id). */
  threadId: Annotation<string>,

  /** Conversation messages managed by the checkpointer. */
  messages: Annotation<BaseMessage[]>({
    reducer: (state, update) => [...state, ...update],
    default: () => [],
  }),

  /** Assembled system prompt injected each turn (from contextBuilder). */
  systemPrompt: Annotation<string>({
    reducer: (_state, update) => update,
    default: () => "",
  }),

  /** Latest user input text (convenience — also in messages). */
  userInput: Annotation<string>({
    reducer: (_state, update) => update,
    default: () => "",
  }),

  /** Whether this turn's context has already been assembled. */
  contextAssembled: Annotation<boolean>({
    reducer: (_state, update) => update,
    default: () => false,
  }),

  /** Set by the summarization guard when TTL or size thresholds are exceeded. */
  needsSummarization: Annotation<boolean>({
    reducer: (_state, update) => update,
    default: () => false,
  }),

  /** Error propagation channel (null = no error). */
  error: Annotation<string | null>({
    reducer: (_state, update) => update,
    default: () => null,
  }),
});

export type SchedulerAgentState = typeof SchedulerAgentAnnotation.State;
