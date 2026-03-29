import type { Queue } from "bullmq";
import type { AgentChatJobData, AgentChatJobResult } from "./queues/agentChat.bull";
import type { CompiledStateGraph } from "@langchain/langgraph";

let _agentChatQueue: Queue<AgentChatJobData, AgentChatJobResult, string>;
let _graph: CompiledStateGraph<any, any, any>;

export function setDeps(deps: {
  agentChatQueue: Queue<AgentChatJobData, AgentChatJobResult, string>;
  graph: CompiledStateGraph<any, any, any>;
}) {
  _agentChatQueue = deps.agentChatQueue;
  _graph = deps.graph;
}

export function getAgentChatQueue() {
  return _agentChatQueue;
}

export function getGraph() {
  return _graph;
}
