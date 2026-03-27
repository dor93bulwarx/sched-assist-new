import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";
import fs from "fs";

const minLogLevel = process.env.LOG_LEVEL || "info";
const LOG_DIR = process.env.LOG_DIR || "/app/logs";

// ensure dir exists
fs.mkdirSync(LOG_DIR, { recursive: true });

/**
 * Ensures stacks are captured.
 * - If you pass an Error -> winston.format.errors({ stack: true }) keeps its stack.
 * - If you pass a string/object at level=error -> synthesize a stack so you still get callsite info.
 */
const synthesizeStackForNonError = winston.format((info) => {
  // Already an Error (handled by errors({stack:true})) or already has stack
  if (info instanceof Error || (info as any).stack) return info;

  if (info.level === "error") {
    const msg =
      typeof info.message === "string"
        ? info.message
        : JSON.stringify(info.message);
    const err = new Error(msg);
    //write the call stack when each function call is in a new line
    const stackLines = err.stack?.split("\n") || [];
    const formattedStack = stackLines.map((line) => `  ${line}`).join("\n");
    (info as any).stack = formattedStack;
  }
  return info;
})();

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }), // keep stack on real Error objects
  synthesizeStackForNonError, // add stack for non-Error error logs
  winston.format.json()
);

const consoleFormatDev = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  synthesizeStackForNonError,
  winston.format.printf(({ level, message, stack, timestamp, ...meta }) => {
    // Pretty console output with stack (if present)
    const base = `${timestamp} ${level}: ${message}`;
    const metaStr =
      Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
    return stack ? `${base}\n${stack}${metaStr}` : `${base}${metaStr}`;
  })
);

const logger = winston.createLogger({
  level: minLogLevel,
  format: jsonFormat,
  transports: [
    new DailyRotateFile({
      filename: path.join(LOG_DIR, "error-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      level: "error",
      maxFiles: "14d",
      zippedArchive: false,
    }),
    new DailyRotateFile({
      filename: path.join(LOG_DIR, "combined-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxFiles: "14d",
      zippedArchive: false,
    }),
  ],
});

const sqlLogger = winston.createLogger({
  level: "info",
  format: jsonFormat,
  transports: [
    new DailyRotateFile({
      filename: path.join(LOG_DIR, "sql-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxFiles: "14d",
      zippedArchive: false,
    }),
  ],
});

if (process.env.NODE_ENV !== "production") {
  const consoleTransport = new winston.transports.Console({
    format: consoleFormatDev,
  });
  logger.add(consoleTransport);
  sqlLogger.add(consoleTransport);
}

export { logger, sqlLogger };
