import { Router } from "express";
import { createApproval, decideApproval, listApprovals } from "../approval/store.js";
import { ensureTenantMatch, getTenantIdOrThrow } from "../tenancy/guard.js";

export const approvalRouter = Router();

approvalRouter.get("/approvals", async (req, res) => {
  const tenant_id = ensureTenantMatch(req, req.query.tenant_id as string | undefined);
  const limit = Number(req.query.limit ?? 100);
  const rows = await listApprovals({
    tenant_id,
    agent_id: req.query.agent_id as string | undefined,
    status: req.query.status as "pending" | "approved" | "rejected" | undefined,
    limit: Number.isNaN(limit) ? 100 : limit
  });
  res.json({ approvals: rows });
});

approvalRouter.post("/approvals", async (req, res) => {
  try {
    const { tenant_id, agent_id, run_id, reason } = req.body as {
      tenant_id?: string;
      agent_id?: string;
      run_id?: string;
      reason?: string;
    };

    if (!tenant_id || !agent_id || !run_id || !reason) {
      return res.status(400).json({ error: "tenant_id, agent_id, run_id, reason are required" });
    }

    const tenant = ensureTenantMatch(req, tenant_id);
    return res.status(201).json(await createApproval({ tenant_id: tenant, agent_id, run_id, reason }));
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

approvalRouter.post("/approvals/:id/decision", async (req, res) => {
  try {
    const tenant_id = getTenantIdOrThrow(req);
    const { operator_id, decision, note } = req.body as {
      operator_id?: string;
      decision?: "approved" | "rejected";
      note?: string;
    };

    if (!operator_id || !decision) {
      return res.status(400).json({ error: "operator_id and decision are required" });
    }

    return res.json(await decideApproval({ tenant_id, id: req.params.id, operator_id, decision, note }));
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});
