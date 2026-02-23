import { Router } from "express";
import { agentHub } from "../agents/agentHub.js";
import { provisionAgentOnNode } from "../fleet/provisioner.js";
import { createNode, getNode, patchAgent, upsertCloud, upsertTenant } from "../fleet/store.js";
import { ensureTenantMatch } from "../tenancy/guard.js";

export const fleetRouter = Router();

fleetRouter.post("/fleet/nodes", async (req, res) => {
  try {
    const { tenant_id, cloud_id, name, mode, ssh_host, ssh_user, ssh_port, base_path, metadata } = req.body as {
      tenant_id?: string;
      cloud_id?: string;
      name?: string;
      mode?: "local" | "ssh";
      ssh_host?: string;
      ssh_user?: string;
      ssh_port?: number;
      base_path?: string;
      metadata?: Record<string, unknown>;
    };

    if (!tenant_id || !cloud_id || !name || !mode) {
      return res.status(400).json({ error: "tenant_id, cloud_id, name, mode are required" });
    }

    const tenant = ensureTenantMatch(req, tenant_id);
    await upsertTenant({ tenant_id: tenant, name: tenant });
    const node = await createNode({
      tenant_id: tenant,
      agent_id: "system-fleet",
      cloud_id,
      name,
      mode,
      ssh_host,
      ssh_user,
      ssh_port,
      base_path,
      metadata
    });

    return res.status(201).json(node);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

fleetRouter.post("/fleet/agents", async (req, res) => {
  try {
    const { id, tenant_id, cloud_id, name, skills = [] } = req.body as {
      id?: string;
      tenant_id?: string;
      cloud_id?: string;
      name?: string;
      skills?: string[];
    };

    if (!tenant_id || !cloud_id || !name) {
      return res.status(400).json({ error: "tenant_id, cloud_id and name are required" });
    }

    const tenant = ensureTenantMatch(req, tenant_id);
    await upsertTenant({ tenant_id: tenant, name: tenant });
    await upsertCloud({ tenant_id: tenant, name: cloud_id, provider: "local", region: "local" });

    const agent = await agentHub.createAgent({ id, tenant_id: tenant, name, workspace: id ?? undefined });
    for (const skill of skills) {
      await agentHub.attachSkill(agent.id, { skillName: skill }, tenant);
    }

    await patchAgent({
      agent_id: agent.agent_id,
      updates: {
        tenant_id: tenant,
        agent_id: agent.agent_id,
        name,
        status: "stopped"
      }
    });

    return res.status(201).json({ ...agent, cloud_id, skills });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

fleetRouter.post("/fleet/agents/:id/provision", async (req, res) => {
  try {
    const { node_id, tenant_id, skills = [] } = req.body as { node_id?: string; tenant_id?: string; skills?: string[] };
    if (!node_id || !tenant_id) {
      return res.status(400).json({ error: "node_id and tenant_id are required" });
    }
    const tenant = ensureTenantMatch(req, tenant_id);

    const node = await getNode(node_id);
    if (!node) return res.status(404).json({ error: "Node not found" });
    if (node.tenant_id !== tenant) return res.status(403).json({ error: "Node does not belong to request tenant" });

    const agent = agentHub.getAgent(req.params.id, tenant);
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    const result = await provisionAgentOnNode({
      node,
      agent_id: agent.agent_id,
      tenant_id: tenant,
      skills
    });

    await patchAgent({
      agent_id: agent.agent_id,
      updates: {
        tenant_id: tenant,
        agent_id: agent.agent_id,
        status: "running"
      }
    });

    return res.json({ ok: true, tenant_id: tenant, agent_id: agent.agent_id, node_id, ...result });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});
