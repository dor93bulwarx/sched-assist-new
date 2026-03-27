import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";
import fs from "fs";

const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const LOG_DIR = process.env.LOG_DIR || path.join(process.env.DATA_DIR || "/app/data", "logs", "agent_service");

fs.mkdirSync(LOG_DIR, { recursive: true });

const synthesizeStack = winston.format((info) => {
  if (info instanceof Error || (info as any).stack) return info;
  if (info.level === "error") {
    const msg = typeof info.message === "string" ? info.message : JSON.stringify(info.message);
    const err = new Error(msg);
    (info as any).stack = err.stack
      ?.split("\n")
      .map((l) => `  ${l}`)
      .join("\n");
  }
  return info;
})();

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  synthesizeStack,
  winston.format.json(),
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: "HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  synthesizeStack,
  winston.format.printf(({ level, message, stack, timestamp, ...meta }) => {
    const base = `${timestamp} ${level}: ${message}`;
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
    return stack ? `${base}\n${stack}${metaStr}` : `${base}${metaStr}`;
  }),
);

const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: jsonFormat,
  defaultMeta: { service: "agent_service" },
  transports: [
    new DailyRotateFile({
      filename: path.join(LOG_DIR, "error-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      level: "error",
      maxFiles: "14d",
    }),
    new DailyRotateFile({
      filename: path.join(LOG_DIR, "combined-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxFiles: "14d",
    }),
  ],
});

if (process.env.NODE_ENV !== "production") {
  logger.add(new winston.transports.Console({ format: consoleFormat }));
}

export { logger };
