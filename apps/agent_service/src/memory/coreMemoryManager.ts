import fs from "fs/promises";
import path from "path";
import { logger } from "../logger";

/**
 * Root directory for persisted employee/user data (mounted Docker volume).
 * Override with `DATA_DIR` env var in production.
 */
const DATA_DIR = process.env.DATA_DIR ?? "/app/data";

function coreMemoryPath(userId: string): string {
  return path.join(DATA_DIR, "users", userId, "core_memory.md");
}

/**
 * Reads the core memory markdown file for a user.
 * Returns a friendly default if the file does not exist.
 */
export async function getCoreMemory(userId: string): Promise<string> {
  try {
    const content = await fs.readFile(coreMemoryPath(userId), "utf-8");
    return content.trim() || "No specific core preferences set.";
  } catch (err: unknown) {
    // ENOENT is expected for new users — return the default.
    const code = err && typeof err === "object" && "code" in err ? (err as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") {
      return "No specific core preferences set.";
    }
    logger.error("Core memory read error", { error: String(err) });
    return "No specific core preferences set.";
  }
}

/**
 * Writes core memory for a user.
 *
 * @param userId  - The user identifier (`users.id`).
 * @param action  - `append` adds to the file; `rewrite` replaces entirely.
 * @param content - Text to append or the full new body for rewrite.
 */
export async function updateCoreMemory(
  userId: string,
  action: "append" | "rewrite",
  content: string,
): Promise<boolean> {
  const filePath = coreMemoryPath(userId);
  const dir = path.dirname(filePath);

  try {
    await fs.mkdir(dir, { recursive: true });

    if (action === "rewrite") {
      await fs.writeFile(filePath, content, "utf-8");
      return true;
    }

    const existing = await getCoreMemory(userId);
    const base =
      existing === "No specific core preferences set." ? "" : `${existing}\n\n`;
    await fs.writeFile(filePath, `${base}${content}`, "utf-8");
    return true;
  } catch (err) {
    logger.error(`Core memory ${action} failed`, { userId, error: String(err) });
    return false;
  }
}
