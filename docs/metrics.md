# Metrics Reference

Prometheus endpoint:

- `GET /metrics`

## Core Metrics

- `talkative_agent_runs_total` (counter)
- `talkative_tool_calls_total` (counter)
- `talkative_tool_failures_total` (counter)
- `talkative_router_tokens_total` (counter)
- `talkative_router_cost_usd_total` (counter)

## HTTP Metrics

- `talkative_http_requests_total{method,endpoint}` (counter)
- `talkative_http_requests_failed_total{method,endpoint}` (counter)
- `talkative_http_request_duration_ms_bucket{method,endpoint,le}` (histogram bucket)
- `talkative_http_request_duration_ms_sum{method,endpoint}` (histogram sum)
- `talkative_http_request_duration_ms_count{method,endpoint}` (histogram count)

## Local Scrape Example

```bash
curl -s http://localhost:4000/metrics | sed -n '1,120p'
```
