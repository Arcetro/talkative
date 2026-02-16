import { Router } from "express";
import { createNode, createOrUpdateWorkflow, getWorkflowById, patchNode } from "../services/workflowStore.js";

export const workflowRouter = Router();

workflowRouter.post("/workflow", async (req, res) => {
  try {
    const { id, name, nodes = [], edges = [] } = req.body as {
      id?: string;
      name?: string;
      nodes?: unknown[];
      edges?: unknown[];
    };

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const workflow = await createOrUpdateWorkflow({ id, name, nodes: nodes as any, edges: edges as any });
    return res.json(workflow);
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

workflowRouter.get("/workflow/:id", async (req, res) => {
  const workflow = await getWorkflowById(req.params.id);
  if (!workflow) {
    return res.status(404).json({ error: "Workflow not found" });
  }

  return res.json(workflow);
});

workflowRouter.post("/node", async (req, res) => {
  try {
    const { workflowId, node } = req.body as { workflowId?: string; node?: unknown };
    if (!workflowId || !node) {
      return res.status(400).json({ error: "workflowId and node are required" });
    }

    const created = await createNode({ workflowId, node: node as any });
    return res.status(201).json(created);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

workflowRouter.patch("/node/:id", async (req, res) => {
  try {
    const { workflowId, updates } = req.body as { workflowId?: string; updates?: unknown };
    if (!workflowId || !updates) {
      return res.status(400).json({ error: "workflowId and updates are required" });
    }

    const updated = await patchNode({
      nodeId: req.params.id,
      workflowId,
      updates: updates as any
    });

    return res.json(updated);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});
