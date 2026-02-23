import assert from "node:assert/strict";
import test from "node:test";
import {
  recordAgentEvent,
  recordHttpRequest,
  recordRouterUsage,
  renderPrometheusMetrics,
  resetMetricsForTests
} from "./metrics.js";

test.beforeEach(() => {
  resetMetricsForTests();
});

test("metrics counters include runs, tool calls and failures", () => {
  recordAgentEvent("MESSAGE_RECEIVED");
  recordAgentEvent("TOOL_RUN_FINISHED", { ok: true });
  recordAgentEvent("TOOL_RUN_FINISHED", { ok: false });

  const text = renderPrometheusMetrics();
  assert.match(text, /talkative_agent_runs_total 1/);
  assert.match(text, /talkative_tool_calls_total 2/);
  assert.match(text, /talkative_tool_failures_total 1/);
});

test("metrics include router cost/tokens and http latency histogram", () => {
  recordRouterUsage({ tokens: 120, cost: 0.0021 });
  recordHttpRequest({ method: "POST", endpoint: "/agents/:id/message", statusCode: 200, durationMs: 87 });
  recordHttpRequest({ method: "POST", endpoint: "/agents/:id/message", statusCode: 500, durationMs: 210 });

  const text = renderPrometheusMetrics();
  assert.match(text, /talkative_router_tokens_total 120/);
  assert.match(text, /talkative_router_cost_usd_total 0.0021/);
  assert.match(text, /talkative_http_requests_total\{endpoint="\/agents\/:id\/message",method="POST"\} 2/);
  assert.match(text, /talkative_http_requests_failed_total\{endpoint="\/agents\/:id\/message",method="POST"\} 1/);
  assert.match(text, /talkative_http_request_duration_ms_bucket\{endpoint="\/agents\/:id\/message",method="POST",le="100"\} 1/);
  assert.match(text, /talkative_http_request_duration_ms_count\{endpoint="\/agents\/:id\/message",method="POST"\} 2/);
});
