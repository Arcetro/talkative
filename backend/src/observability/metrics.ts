type Histogram = {
  buckets: number[];
  bucketCounts: Map<number, number>;
  count: number;
  sum: number;
};

const LATENCY_BUCKETS_MS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

const state = {
  agent_runs_total: 0,
  tool_calls_total: 0,
  tool_failures_total: 0,
  router_tokens_total: 0,
  router_cost_usd_total: 0,
  http_requests_total: new Map<string, number>(),
  http_requests_failed_total: new Map<string, number>(),
  http_request_duration_ms: new Map<string, Histogram>()
};

function key(labels: Record<string, string>): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("|");
}

function parseKey(compact: string): Record<string, string> {
  if (!compact) return {};
  return Object.fromEntries(compact.split("|").map((part) => {
    const [k, v] = part.split("=");
    return [k, v];
  }));
}

function labelsString(labels: Record<string, string>): string {
  const parts = Object.entries(labels).map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`);
  return `{${parts.join(",")}}`;
}

function getHistogram(map: Map<string, Histogram>, compactKey: string): Histogram {
  const existing = map.get(compactKey);
  if (existing) return existing;

  const created: Histogram = {
    buckets: LATENCY_BUCKETS_MS,
    bucketCounts: new Map(LATENCY_BUCKETS_MS.map((b) => [b, 0])),
    count: 0,
    sum: 0
  };
  map.set(compactKey, created);
  return created;
}

function inc(map: Map<string, number>, labels: Record<string, string>, by = 1): void {
  const compact = key(labels);
  map.set(compact, (map.get(compact) ?? 0) + by);
}

function observeLatency(labels: Record<string, string>, durationMs: number): void {
  const compact = key(labels);
  const hist = getHistogram(state.http_request_duration_ms, compact);

  hist.count += 1;
  hist.sum += durationMs;

  for (const bucket of hist.buckets) {
    if (durationMs <= bucket) {
      hist.bucketCounts.set(bucket, (hist.bucketCounts.get(bucket) ?? 0) + 1);
    }
  }
}

export function recordAgentEvent(
  eventType: string,
  payload?: { ok?: boolean | undefined } | Record<string, unknown> | undefined
): void {
  if (eventType === "MESSAGE_RECEIVED") {
    state.agent_runs_total += 1;
  }
  if (eventType === "TOOL_RUN_FINISHED") {
    state.tool_calls_total += 1;
    if (payload && typeof payload === "object" && "ok" in payload && payload.ok === false) {
      state.tool_failures_total += 1;
    }
  }
}

export function recordRouterUsage(input: { tokens: number; cost: number }): void {
  state.router_tokens_total += input.tokens;
  state.router_cost_usd_total += input.cost;
}

export function recordHttpRequest(input: {
  method: string;
  endpoint: string;
  statusCode: number;
  durationMs: number;
}): void {
  const labels = {
    method: input.method.toUpperCase(),
    endpoint: input.endpoint
  };
  inc(state.http_requests_total, labels, 1);
  if (input.statusCode >= 400) {
    inc(state.http_requests_failed_total, labels, 1);
  }
  observeLatency(labels, input.durationMs);
}

function renderCounter(name: string, help: string, value: number): string[] {
  return [
    `# HELP ${name} ${help}`,
    `# TYPE ${name} counter`,
    `${name} ${value}`
  ];
}

function renderLabeledCounter(name: string, help: string, map: Map<string, number>): string[] {
  const rows = [
    `# HELP ${name} ${help}`,
    `# TYPE ${name} counter`
  ];
  for (const [compact, value] of map.entries()) {
    rows.push(`${name}${labelsString(parseKey(compact))} ${value}`);
  }
  return rows;
}

function renderLatencyHistogram(): string[] {
  const name = "talkative_http_request_duration_ms";
  const rows = [
    `# HELP ${name} HTTP request latency in milliseconds`,
    `# TYPE ${name} histogram`
  ];

  for (const [compact, hist] of state.http_request_duration_ms.entries()) {
    const labels = parseKey(compact);
    for (const bucket of hist.buckets) {
      rows.push(`${name}_bucket${labelsString({ ...labels, le: String(bucket) })} ${hist.bucketCounts.get(bucket) ?? 0}`);
    }
    rows.push(`${name}_bucket${labelsString({ ...labels, le: "+Inf" })} ${hist.count}`);
    rows.push(`${name}_sum${labelsString(labels)} ${hist.sum}`);
    rows.push(`${name}_count${labelsString(labels)} ${hist.count}`);
  }

  return rows;
}

export function renderPrometheusMetrics(): string {
  const lines = [
    ...renderCounter("talkative_agent_runs_total", "Total agent runs observed", state.agent_runs_total),
    ...renderCounter("talkative_tool_calls_total", "Total tool calls completed", state.tool_calls_total),
    ...renderCounter("talkative_tool_failures_total", "Total failed tool calls", state.tool_failures_total),
    ...renderCounter("talkative_router_tokens_total", "Total router tokens observed", state.router_tokens_total),
    ...renderCounter("talkative_router_cost_usd_total", "Total router cost in USD", Number(state.router_cost_usd_total.toFixed(6))),
    ...renderLabeledCounter("talkative_http_requests_total", "Total HTTP requests by endpoint", state.http_requests_total),
    ...renderLabeledCounter("talkative_http_requests_failed_total", "Total failed HTTP requests by endpoint", state.http_requests_failed_total),
    ...renderLatencyHistogram()
  ];
  return `${lines.join("\n")}\n`;
}

export function resetMetricsForTests(): void {
  state.agent_runs_total = 0;
  state.tool_calls_total = 0;
  state.tool_failures_total = 0;
  state.router_tokens_total = 0;
  state.router_cost_usd_total = 0;
  state.http_requests_total.clear();
  state.http_requests_failed_total.clear();
  state.http_request_duration_ms.clear();
}
