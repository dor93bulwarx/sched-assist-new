import { StateGraph, START, END } from "@langchain/langgraph";
import {
  VulnerabilityAnalysisAnnotation,
  VulnerabilityAnalysisState,
} from "./state";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import { logger } from "../startup/logger";

const llm = new ChatOpenAI({
  modelName: "gpt-4o",
  temperature: 0,
  apiKey: process.env.OPENAI_API_KEY,
});

async function validateVulnerabilityNode(
  state: VulnerabilityAnalysisState,
): Promise<Partial<VulnerabilityAnalysisState>> {
  try {
    const prompt = `
Analyze the following email/text content and determine if it is reporting a software vulnerability, security advisory, or CVE.
Return exactly "YES" if it is about a vulnerability, and exactly "NO" if it is not.

Content:
${state.vulnerabilityData.substring(0, 3000)}
`;

    logger.info("validateVulnerabilityNode prompt sent: " + prompt);
    const result = await llm.invoke([new HumanMessage(prompt)]);
    logger.info("validateVulnerabilityNode result: " + JSON.stringify(result));
    const isVulnerability =
      result.content.toString().trim().toUpperCase() === "YES";

    if (!isVulnerability) {
      logger.info("Content identified as NOT related to a vulnerability.");
    } else {
      logger.info("Content identified as a vulnerability report.");
    }

    return {
      isVulnerability,
    };
  } catch (error: any) {
    logger.error("Error in validateVulnerabilityNode: " + error);
    return { error: error.message };
  }
}

// Create a subgraph just for validation (could be expanded later with more validation steps)
const validationWorkflow = new StateGraph(VulnerabilityAnalysisAnnotation)
  .addNode("validateVulnerability", validateVulnerabilityNode)
  .addEdge(START, "validateVulnerability")
  .addEdge("validateVulnerability", END);

export const validationGraph = validationWorkflow.compile();
