import { Router } from "express";
import { createNode, createOrUpdateWorkflow, getWorkflowById, patchNode } from "../services/workflowStore.js";
import { ensureTenantMatch, getTenantIdOrThrow } from "../tenancy/guard.js";

export const workflowRouter = Router();

workflowRouter.post("/workflow", async (req, res) => {
  try {
    const { id, name, nodes = [], edges = [] } = req.body as {
      id?: string;
      tenant_id?: string;
      name?: string;
      nodes?: unknown[];
      edges?: unknown[];
    };

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const tenant_id = ensureTenantMatch(req, req.body.tenant_id);
    const workflow = await createOrUpdateWorkflow({ id, tenant_id, name, nodes: nodes as any, edges: edges as any });
    return res.json(workflow);
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

workflowRouter.get("/workflow/:id", async (req, res) => {
  const tenant_id = getTenantIdOrThrow(req);
  const workflow = await getWorkflowById(req.params.id, tenant_id);
  if (!workflow) {
    return res.status(404).json({ error: "Workflow not found" });
  }

  return res.json(workflow);
});

workflowRouter.post("/node", async (req, res) => {
  try {
    const { workflowId, node, tenant_id } = req.body as { workflowId?: string; node?: unknown; tenant_id?: string };
    if (!workflowId || !node) {
      return res.status(400).json({ error: "workflowId and node are required" });
    }

    const tenant = ensureTenantMatch(req, tenant_id);
    const created = await createNode({ tenant_id: tenant, workflowId, node: node as any });
    return res.status(201).json(created);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

workflowRouter.patch("/node/:id", async (req, res) => {
  try {
    const { workflowId, updates, tenant_id } = req.body as { workflowId?: string; updates?: unknown; tenant_id?: string };
    if (!workflowId || !updates) {
      return res.status(400).json({ error: "workflowId and updates are required" });
    }

    const tenant = ensureTenantMatch(req, tenant_id);
    const updated = await patchNode({
      tenant_id: tenant,
      nodeId: req.params.id,
      workflowId,
      updates: updates as any
    });

    return res.json(updated);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});
