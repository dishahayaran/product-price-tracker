/**
 * Minimal structured logger.
 * Outputs lines like: [2024-06-18 09:00:01] [INFO] Message  {optional json}
 * No dependencies — just console wrappers with timestamps.
 */

type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

function timestamp(): string {
  return new Date()
    .toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
    .replace(",", "");
}

function log(level: LogLevel, message: string, meta?: unknown): void {
  const prefix = `[${timestamp()}] [${level.padEnd(5)}]`;
  const metaStr = meta !== undefined ? "  " + JSON.stringify(meta) : "";
  const line = `${prefix} ${message}${metaStr}`;

  if (level === "ERROR") {
    console.error(line);
  } else if (level === "WARN") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (msg: string, meta?: unknown) => log("INFO", msg, meta),
  warn: (msg: string, meta?: unknown) => log("WARN", msg, meta),
  error: (msg: string, meta?: unknown) => log("ERROR", msg, meta),
  debug: (msg: string, meta?: unknown) => {
    if (process.env.DEBUG === "true") log("DEBUG", msg, meta);
  },
};
