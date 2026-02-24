export interface LogContext {
  request_id?: string;
  tenant_id?: string;
  agent_id?: string;
  run_id?: string;
}

export interface LogEntry {
  timestamp: string;
  level: "info" | "error";
  message: string;
  service: string;
  context?: LogContext;
  data?: Record<string, unknown>;
}

const SERVICE_NAME = "workflow-agent-backend";

export function buildLogEntry(input: {
  level: "info" | "error";
  message: string;
  context?: LogContext;
  data?: Record<string, unknown>;
}): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level: input.level,
    message: input.message,
    service: SERVICE_NAME,
    ...(input.context ? { context: input.context } : {}),
    ...(input.data ? { data: input.data } : {})
  };
}

export function logInfo(message: string, options?: { context?: LogContext; data?: Record<string, unknown> }): void {
  process.stdout.write(`${JSON.stringify(buildLogEntry({ level: "info", message, ...options }))}\n`);
}

export function logError(message: string, options?: { context?: LogContext; data?: Record<string, unknown> }): void {
  process.stderr.write(`${JSON.stringify(buildLogEntry({ level: "error", message, ...options }))}\n`);
}
