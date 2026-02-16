export interface Tenant {
  id: string;
  tenant_id: string;
  agent_id: string;
  name: string;
  created_at: string;
}

export interface CloudPool {
  id: string;
  tenant_id: string;
  agent_id: string;
  name: string;
  provider: "local" | "aws" | "gcp" | "azure" | "other";
  region: string;
  created_at: string;
}

export interface NodeHost {
  id: string;
  tenant_id: string;
  agent_id: string;
  cloud_id: string;
  name: string;
  mode: "local" | "ssh";
  ssh_host?: string;
  ssh_user?: string;
  ssh_port?: number;
  base_path?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface AgentInstance {
  id: string;
  agent_id: string;
  tenant_id: string;
  cloud_id: string;
  node_id?: string;
  name: string;
  workspace: string;
  skills: string[];
  status: "stopped" | "running" | "provisioned";
  created_at: string;
}
