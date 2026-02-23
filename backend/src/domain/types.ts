export type NodeStatus = "pending" | "active" | "done";

export interface NodeMetrics {
  timeSpent: number;
  cost: number;
  notes: string;
}

export interface NodeContribution {
  executedBy?: string;
  estimatedEffort?: number;
  realTimeSpent?: number;
  valueContribution?: number;
}

export interface WorkflowNode {
  id: string;
  name: string;
  description: string;
  inputs: string[];
  outputs: string[];
  assignedPerson?: string;
  status: NodeStatus;
  metrics: NodeMetrics;
  contribution?: NodeContribution;
  position?: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

export interface WorkflowVersion {
  version: number;
  createdAt: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  note?: string;
}

export interface Workflow {
  id: string;
  tenant_id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  versions: WorkflowVersion[];
}

export type ConversationInput =
  | { type: "text"; text: string }
  | { type: "audio"; audioRef: string };

export interface InterpreterNodeSuggestion {
  type: "node";
  name: string;
  description: string;
}

export interface InterpreterConnectionsSuggestion {
  type: "connections";
  links: Array<{ sourceName: string; targetName: string }>;
}

export interface InterpreterResult {
  detectedTasks: string[];
  suggestions: Array<InterpreterNodeSuggestion | InterpreterConnectionsSuggestion>;
}
