import * as fs from "fs/promises";
import * as path from "path";
import type { CoreMemoryAction } from "@scheduling-agent/types";

/**
 * Base directory for per-employee data.
 * Points to the mounted Docker volume (`/app/data` inside the container,
 * configurable via DATA_DIR for local development).
 */
const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");

const DEFAULT_CORE_MEMORY = "No specific core preferences set.";

/**
 * Resolves the absolute path to an employee's core_memory.md file.
 */
function coreMemoryPath(empId: string): string {
  return path.join(DATA_DIR, "employees", empId, "core_memory.md");
}

/**
 * Reads the core memory markdown file for the given employee.
 *
 * Returns the file contents, or a sensible default string when the file
 * (or its parent directory) does not exist yet.
 */
export async function getCoreMemory(empId: string): Promise<string> {
  try {
    const content = await fs.readFile(coreMemoryPath(empId), "utf-8");
    return content.trim() || DEFAULT_CORE_MEMORY;
  } catch (err: unknown) {
    // ENOENT is expected for new employees — return the default.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return DEFAULT_CORE_MEMORY;
    }
    throw err;
  }
}

/**
 * Updates the core memory markdown file for the given employee.
 *
 * @param empId   - The employee identifier.
 * @param action  - `"append"` adds content to the end; `"rewrite"` replaces the file.
 * @param content - The markdown text to write.
 * @returns `true` on success.
 */
export async function updateCoreMemory(
  empId: string,
  action: CoreMemoryAction,
  content: string,
): Promise<boolean> {
  const filePath = coreMemoryPath(empId);

  try {
    // Ensure the directory tree exists before any write.
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    if (action === "rewrite") {
      await fs.writeFile(filePath, content, "utf-8");
    } else {
      // append — add a newline separator so entries don't merge.
      const existing = await getCoreMemory(empId);
      const separator =
        existing === DEFAULT_CORE_MEMORY ? "" : existing + "\n";
      await fs.writeFile(filePath, separator + content, "utf-8");
    }

    return true;
  } catch (err) {
    console.error(
      `[coreMemoryManager] Failed to ${action} core memory for emp ${empId}:`,
      err,
    );
    return false;
  }
}
