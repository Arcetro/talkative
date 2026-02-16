import { EventEmitter } from "node:events";

export type DomainEvent = {
  type: "workflow.created" | "workflow.updated" | "node.created" | "node.updated";
  timestamp: string;
  payload: Record<string, unknown>;
};

const bus = new EventEmitter();

export function publishEvent(event: DomainEvent): void {
  bus.emit("domain-event", event);
}

export function subscribeEvents(listener: (event: DomainEvent) => void): () => void {
  bus.on("domain-event", listener);
  return () => bus.off("domain-event", listener);
}
