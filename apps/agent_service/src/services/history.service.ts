import { getGraph } from "../deps";

export class HistoryService {
  /** Transform a raw LangGraph message into a plain HistoryMessage DTO. */
  private toHistoryMessage(m: any) {
    let role: "user" | "assistant" = "user";
    if (typeof m._getType === "function") {
      const t = m._getType();
      role = t === "human" ? "user" : "assistant";
    } else if (m.role === "assistant" || m.role === "ai") {
      role = "assistant";
    }
    const content =
      typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    const senderName = role === "user" ? (m.name ?? null) : null;
    const ak = m.additional_kwargs ?? m.kwargs?.additional_kwargs;
    const modelSlug = role === "assistant" && ak?.modelSlug ? ak.modelSlug : undefined;
    const vendorSlug = role === "assistant" && ak?.vendorSlug ? ak.vendorSlug : undefined;
    const modelName = role === "assistant" && ak?.modelName ? ak.modelName : undefined;
    return {
      role,
      content,
      ...(senderName ? { senderName } : {}),
      ...(modelSlug ? { modelSlug } : {}),
      ...(vendorSlug ? { vendorSlug } : {}),
      ...(modelName ? { modelName } : {}),
    };
  }

  /** Load raw messages from a thread's checkpoint. */
  private async loadRawMessages(threadId: string): Promise<any[]> {
    const graph = getGraph();
    const state = await graph.getState({
      configurable: { thread_id: threadId },
    });
    if (!state?.values) return [];
    return Array.isArray(state.values.messages) ? state.values.messages : [];
  }

  async search(threadId: string, q: string) {
    if (!q) return { results: [], total: 0 };

    const msgs = await this.loadRawMessages(threadId);
    const total = msgs.length;
    const results: { index: number; role: string; content: string; senderName?: string; modelSlug?: string; vendorSlug?: string; modelName?: string }[] = [];

    for (let i = 0; i < msgs.length; i++) {
      const h = this.toHistoryMessage(msgs[i]);
      if (h.content.toLowerCase().includes(q)) {
        results.push({ index: i, ...h });
      }
    }

    return { results, total };
  }

  async getHistory(threadId: string, query: { limit?: number; offset?: number }) {
    const msgs = await this.loadRawMessages(threadId);
    const total = msgs.length;

    let slice: any[];
    if (query.limit != null) {
      const offset = query.offset ?? Math.max(0, total - query.limit);
      const end = Math.min(total, offset + query.limit);
      slice = msgs.slice(Math.max(0, offset), end);
    } else {
      slice = msgs;
    }

    const messages = slice.map((m) => this.toHistoryMessage(m));
    return { messages, total };
  }
}
