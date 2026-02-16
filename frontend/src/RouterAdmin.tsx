import { useEffect, useMemo, useState } from "react";
import {
  getRouterBudgets,
  getRouterMetrics,
  getRouterRules,
  getRouterUsage,
  putRouterBudgets,
  putRouterRules
} from "./api";
import { RouterBudgetCaps, RouterRuleSet, RouterUsageRecord } from "./types";

type Tab = "overview" | "rules" | "usage" | "budgets";

export default function RouterAdmin() {
  const [tab, setTab] = useState<Tab>("overview");
  const [status, setStatus] = useState("Router Admin ready");
  const [rules, setRules] = useState<RouterRuleSet | null>(null);
  const [budgets, setBudgets] = useState<RouterBudgetCaps | null>(null);
  const [usage, setUsage] = useState<RouterUsageRecord[]>([]);
  const [metrics, setMetrics] = useState<{ total_requests: number; total_tokens: number; total_cost: number; error_rate: number } | null>(
    null
  );

  const [rulesText, setRulesText] = useState("");
  const [budgetsText, setBudgetsText] = useState("");
  const [tenantFilter, setTenantFilter] = useState("");
  const [agentFilter, setAgentFilter] = useState("");

  async function refreshAll(): Promise<void> {
    const [rulesData, budgetsData, usageData, metricsData] = await Promise.all([
      getRouterRules(),
      getRouterBudgets(),
      getRouterUsage({ tenant_id: tenantFilter || undefined, agent_id: agentFilter || undefined, limit: 200 }),
      getRouterMetrics()
    ]);

    setRules(rulesData);
    setRulesText(JSON.stringify(rulesData, null, 2));
    setBudgets(budgetsData);
    setBudgetsText(JSON.stringify(budgetsData, null, 2));
    setUsage(usageData.usage);
    setMetrics(metricsData);
  }

  useEffect(() => {
    void refreshAll();
  }, []);

  async function onSaveRules() {
    try {
      const parsed = JSON.parse(rulesText) as RouterRuleSet;
      const saved = await putRouterRules(parsed);
      setRules(saved);
      setStatus(`Rules saved at ${saved.updated_at}`);
    } catch (error) {
      setStatus(`Rules validation/save failed: ${(error as Error).message}`);
    }
  }

  async function onSaveBudgets() {
    try {
      const parsed = JSON.parse(budgetsText) as RouterBudgetCaps;
      const saved = await putRouterBudgets(parsed);
      setBudgets(saved);
      setStatus(`Budgets saved at ${saved.updated_at}`);
    } catch (error) {
      setStatus(`Budgets validation/save failed: ${(error as Error).message}`);
    }
  }

  async function onRefreshUsage() {
    try {
      const result = await getRouterUsage({ tenant_id: tenantFilter || undefined, agent_id: agentFilter || undefined, limit: 200 });
      setUsage(result.usage);
      setStatus(`Loaded ${result.usage.length} usage rows`);
    } catch (error) {
      setStatus(`Usage query failed: ${(error as Error).message}`);
    }
  }

  const totalUsageCost = useMemo(() => usage.reduce((sum, row) => sum + row.cost, 0), [usage]);

  return (
    <div className="mission-main">
      <div className="card">
        <h2>LLM Router Admin</h2>
        <div className="nav-tabs">
          <button className={tab === "overview" ? "tab active" : "tab"} onClick={() => setTab("overview")}>
            Overview
          </button>
          <button className={tab === "rules" ? "tab active" : "tab"} onClick={() => setTab("rules")}>
            Rules
          </button>
          <button className={tab === "usage" ? "tab active" : "tab"} onClick={() => setTab("usage")}>
            Usage
          </button>
          <button className={tab === "budgets" ? "tab active" : "tab"} onClick={() => setTab("budgets")}>
            Budgets
          </button>
        </div>
      </div>

      {tab === "overview" && (
        <div className="card">
          <h2>Overview</h2>
          <p>Total requests: {metrics?.total_requests ?? 0}</p>
          <p>Total tokens: {metrics?.total_tokens ?? 0}</p>
          <p>Total cost: ${metrics?.total_cost?.toFixed(6) ?? "0.000000"}</p>
          <p>Error rate: {((metrics?.error_rate ?? 0) * 100).toFixed(2)}%</p>
          <button onClick={() => void refreshAll()}>Refresh</button>
        </div>
      )}

      {tab === "rules" && (
        <div className="card">
          <h2>Rules</h2>
          <textarea rows={18} value={rulesText} onChange={(event) => setRulesText(event.target.value)} />
          <div className="button-row">
            <button onClick={onSaveRules}>Validate + Save</button>
            <button className="secondary" onClick={() => setRulesText(JSON.stringify(rules, null, 2))}>
              Reset
            </button>
          </div>
        </div>
      )}

      {tab === "usage" && (
        <div className="card">
          <h2>Usage</h2>
          <div className="top-controls">
            <input placeholder="tenant_id" value={tenantFilter} onChange={(event) => setTenantFilter(event.target.value)} />
            <input placeholder="agent_id" value={agentFilter} onChange={(event) => setAgentFilter(event.target.value)} />
            <button onClick={onRefreshUsage}>Query</button>
          </div>
          <p>Rows: {usage.length} | Total cost in view: ${totalUsageCost.toFixed(6)}</p>
          <div className="events-scroll">
            <table className="usage-table">
              <thead>
                <tr>
                  <th>time</th>
                  <th>tenant</th>
                  <th>agent</th>
                  <th>model</th>
                  <th>tokens</th>
                  <th>cost</th>
                  <th>latency</th>
                  <th>status</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.created_at).toLocaleString()}</td>
                    <td>{row.tenant_id}</td>
                    <td>{row.agent_id}</td>
                    <td>{row.model}</td>
                    <td>{row.tokens}</td>
                    <td>{row.cost.toFixed(6)}</td>
                    <td>{row.latency_ms}ms</td>
                    <td>{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "budgets" && (
        <div className="card">
          <h2>Budgets</h2>
          <textarea rows={18} value={budgetsText} onChange={(event) => setBudgetsText(event.target.value)} />
          <div className="button-row">
            <button onClick={onSaveBudgets}>Validate + Save</button>
            <button className="secondary" onClick={() => setBudgetsText(JSON.stringify(budgets, null, 2))}>
              Reset
            </button>
          </div>
        </div>
      )}

      <p className="status">{status}</p>
    </div>
  );
}
