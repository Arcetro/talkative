import { nanoid } from "nanoid";
import { InterpreterResult } from "../domain/types.js";
import { WorkflowPatch, WorkflowPatchOperation } from "./types.js";

export function createPatchFromInterpretation(
  interpretation: InterpreterResult,
  existingVersion: number
): WorkflowPatch {
  const nodeOps: WorkflowPatchOperation[] = [];
  const edgeOps: WorkflowPatchOperation[] = [];

  interpretation.suggestions.forEach((suggestion, index) => {
    if (suggestion.type === "node") {
      nodeOps.push({
        op: "add_node",
        node: {
          id: `patch-node-${existingVersion + 1}-${index + 1}`,
          name: suggestion.name,
          description: suggestion.description
        }
      });
    }

    if (suggestion.type === "connections") {
      suggestion.links.forEach((link, linkIndex) => {
        edgeOps.push({
          op: "add_edge",
          edge: {
            id: `patch-edge-${existingVersion + 1}-${linkIndex + 1}`,
            source: link.sourceName,
            target: link.targetName
          }
        });
      });
    }
  });

  return {
    id: nanoid(10),
    version: existingVersion + 1,
    createdAt: new Date().toISOString(),
    operations: [...nodeOps, ...edgeOps],
    snapshot: {
      nodes: nodeOps.map((op) => op.node!).filter(Boolean),
      edges: edgeOps.map((op) => op.edge!).filter(Boolean)
    }
  };
}
