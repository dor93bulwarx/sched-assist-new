import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { updateCoreMemory } from "../memory/coreMemoryManager";

/**
 * LangChain tool that lets the scheduling agent autonomously update an
 * employee's core memory file — the persistent `.md` rules stored on the
 * Docker volume at `/data/employees/{empId}/core_memory.md`.
 *
 * Use this tool for **permanent** scheduling preferences (e.g. "Works from
 * home on Wednesdays", "Never schedule before 9 AM").  Do **not** use it
 * for one-time events or transient notes — those belong in episodic memory.
 */
export const editCoreMemoryTool = tool(
  async (input) => {
    const { empId, action, content } = input;

    const success = await updateCoreMemory(empId, action, content);

    if (success) {
      return `Core memory for employee "${empId}" has been updated (action: ${action}).`;
    }
    return `Failed to update core memory for employee "${empId}". Check logs for details.`;
  },
  {
    name: "edit_core_memory",
    description:
      "Updates the employee's persistent core memory file with permanent scheduling " +
      "rules or preferences. Use 'append' to add a new rule to the existing file, or " +
      "'rewrite' to replace the entire file when rules need major restructuring. " +
      "Only use this for PERMANENT preferences (e.g. 'Always block 12-1 PM for lunch', " +
      "'Prefers morning meetings'). Do NOT use for one-time events or transient reminders — " +
      "those go into episodic memory instead.",
    schema: z.object({
      empId: z
        .string()
        .describe("The unique employee identifier (emp_id) whose core memory to update."),
      action: z
        .enum(["append", "rewrite"])
        .describe(
          "'append' adds a new rule to the end of the existing file. " +
          "'rewrite' replaces the entire file content (use when removing or heavily restructuring rules).",
        ),
      content: z
        .string()
        .describe(
          "The markdown-formatted text to write. For 'append', this is the new rule(s). " +
          "For 'rewrite', this is the complete replacement content.",
        ),
    }),
  },
);
