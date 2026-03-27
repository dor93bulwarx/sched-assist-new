import { tool } from "langchain";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { store } from "../memory";
import { RunnableConfig } from "@langchain/core/runnables";

// @ts-ignore: Suppress deep type instantiation error due to zod mismatch
export const insertMemoryTool = tool(
  async (input, config?: RunnableConfig) => {
    const { key, content } = input;
    const agentName =
      config?.configurable?.agentId ?? "vulnerability_identification_agent";

    // 1. Write into the daily md file
    const date = new Date();
    const dateString = date.toISOString().split("T")[0]; // YYYY-MM-DD
    const fileName = `${dateString}.md`;

    //create the agent/daily_notes directory if it doesn't exist
    const dailyNotesDirectory = path.join(
      process.cwd(),
      `${agentName}/daily_notes`,
    );
    await fs.mkdir(dailyNotesDirectory, { recursive: true });

    const filePath = path.join(dailyNotesDirectory, fileName);

    let startRow = 1;
    let startColumn = 1;

    try {
      const existingContent = await fs.readFile(filePath, "utf-8");
      if (existingContent.length > 0) {
        const lines = existingContent.split("\n");
        startRow = lines.length;
        startColumn = lines[lines.length - 1].length + 1;
      }
    } catch (e) {
      // File does not exist yet
      startRow = 1;
      startColumn = 1;
    }

    const textToAppend = content + ".";
    const contentLines = textToAppend.split("\n");
    
    const endRow = startRow + contentLines.length - 1;
    let endColumn: number;
    
    if (contentLines.length === 1) {
      endColumn = startColumn + contentLines[0].length - 1;
    } else {
      endColumn = contentLines[contentLines.length - 1].length;
    }

    await fs.appendFile(filePath, textToAppend, "utf-8");

    const namespace = ["agents", agentName, "memories"];

    await store.put(namespace, key, {
      content: textToAppend,
      metadata: {
        source: filePath,
        startRow,
        startColumn,
        endRow,
        endColumn,
      },
    });

    return `Memory '${key}' successfully saved for agent '${agentName}'. File: ${filePath} (Start: [R:${startRow}, C:${startColumn}], End: [R:${endRow}, C:${endColumn}])`;
  },
  {
    name: "insert_memory",
    description:
      "Inserts new information by writing it into a daily markdown file and then storing it in the LangGraph InMemoryStore for the specified agent. Tracks the file path and start/end rows as metadata.",
    schema: z.object({
      key: z
        .string()
        .describe("A unique key identifier for this piece of memory."),
      content: z.string().describe("The new information or content to store."),
    }),
  },
);
