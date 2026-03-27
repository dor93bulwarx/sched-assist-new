import express from "express";
import cors from "cors";
import { AgentSession } from "@scheduling-agent/database";
import { ensureSession } from "./memory/sessionRegistry";

import type { CompiledStateGraph } from "@langchain/langgraph";

/**
 * Creates and returns the Express app for agent_service.
 * The compiled graph is injected so routes can invoke it.
 */
export function createServer(graph: CompiledStateGraph<any, any, any>) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // ── POST /api/chat ───────────────────────────────────────────────────
  app.post("/api/chat", async (req, res) => {
    const { empId, threadId, message } = req.body;

    if (!empId || !threadId || !message) {
      return res.status(400).json({ error: "empId, threadId, and message are required." });
    }

    try {
      // Ensure session row exists and validate emp_id ownership.
      await ensureSession(threadId, empId);

      const result = await graph.invoke(
        {
          empId,
          threadId,
          userInput: message,
          messages: [{ role: "human", content: message }],
        },
        { configurable: { thread_id: threadId } },
      );

      // Extract the last AI message from the result state.
      const messages: any[] = Array.isArray(result.messages) ? result.messages : [];
      const lastAiMessage = [...messages]
        .reverse()
        .find(
          (m: any) =>
            (typeof m._getType === "function" && m._getType() === "ai") ||
            m.role === "assistant",
        );

      const reply =
        lastAiMessage?.content ??
        result.systemPrompt ??
        "Context assembled. Agent response node not yet implemented.";

      return res.json({
        threadId,
        reply: typeof reply === "string" ? reply : JSON.stringify(reply),
        systemPrompt: result.systemPrompt ?? null,
      });
    } catch (err: any) {
      console.error("[server] /api/chat error:", err);
      return res.status(500).json({ error: err.message ?? "Internal error" });
    }
  });

  // ── GET /api/sessions/:empId ─────────────────────────────────────────
  app.get("/api/sessions/:empId", async (req, res) => {
    try {
      const sessions = await AgentSession.findAll({
        where: { empId: req.params.empId },
        order: [["updated_at", "DESC"]],
        attributes: ["id", "threadId", "empId", "title", "createdAt", "updatedAt", "lastActivityAt"],
      });
      return res.json(sessions);
    } catch (err: any) {
      console.error("[server] /api/sessions/:empId error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/sessions ──────────────────────────────────────────────
  app.post("/api/sessions", async (req, res) => {
    const { empId, title } = req.body;

    if (!empId) {
      return res.status(400).json({ error: "empId is required." });
    }

    try {
      const threadId = crypto.randomUUID();
      const session = await ensureSession(threadId, empId);

      if (title) {
        await session.update({ title });
      }

      return res.status(201).json({
        id: session.id,
        threadId: session.threadId,
        empId: session.empId,
        title: session.title,
        createdAt: session.createdAt,
      });
    } catch (err: any) {
      console.error("[server] POST /api/sessions error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  return app;
}
