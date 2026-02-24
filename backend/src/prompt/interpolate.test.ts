import test from "node:test";
import assert from "node:assert/strict";
import { extractVariables, findMissingVariables, interpolate } from "./interpolate.js";

// --- extractVariables ---

test("extractVariables returns empty for plain text", () => {
  assert.deepEqual(extractVariables("Hello world"), []);
});

test("extractVariables finds unique variables in order", () => {
  const tpl = "Hi {{name}}, your agent {{agent_name}} runs for {{tenant_id}}. Welcome {{name}}!";
  assert.deepEqual(extractVariables(tpl), ["name", "agent_name", "tenant_id"]);
});

test("extractVariables handles variables with defaults", () => {
  const tpl = "{{greeting|Hello}} {{name}}!";
  assert.deepEqual(extractVariables(tpl), ["greeting", "name"]);
});

// --- findMissingVariables ---

test("findMissingVariables returns missing required vars", () => {
  const tpl = "Agent {{agent_name}} for {{tenant_id}} says {{greeting|Hi}}";
  const missing = findMissingVariables(tpl, { agent_name: "Bot" });
  assert.deepEqual(missing, ["tenant_id"]);
});

test("findMissingVariables returns empty when all provided", () => {
  const tpl = "{{a}} {{b|default}}";
  assert.deepEqual(findMissingVariables(tpl, { a: "x" }), []);
});

// --- interpolate ---

test("interpolate replaces all variables", () => {
  const tpl = "Hello {{name}}, you work at {{company}}.";
  const result = interpolate(tpl, { name: "Tepha", company: "Myland" });
  assert.equal(result.text, "Hello Tepha, you work at Myland.");
  assert.equal(result.substitutions, 2);
  assert.deepEqual(result.missing, []);
});

test("interpolate uses default when value missing", () => {
  const tpl = "{{greeting|Hello}} {{name}}!";
  const result = interpolate(tpl, { name: "World" });
  assert.equal(result.text, "Hello World!");
  assert.equal(result.substitutions, 2);
  assert.deepEqual(result.missing, []);
});

test("interpolate reports missing vars and leaves placeholder", () => {
  const tpl = "Agent {{agent_name}} status: {{status}}";
  const result = interpolate(tpl, { agent_name: "Bot" });
  assert.equal(result.text, "Agent Bot status: {{status}}");
  assert.equal(result.substitutions, 1);
  assert.deepEqual(result.missing, ["status"]);
});

test("interpolate handles template with no variables", () => {
  const result = interpolate("Just plain text", {});
  assert.equal(result.text, "Just plain text");
  assert.equal(result.substitutions, 0);
  assert.deepEqual(result.missing, []);
});

test("interpolate handles repeated variables", () => {
  const tpl = "{{name}} said hi. Later, {{name}} left.";
  const result = interpolate(tpl, { name: "Ana" });
  assert.equal(result.text, "Ana said hi. Later, Ana left.");
  assert.equal(result.substitutions, 2);
});

test("interpolate handles empty default", () => {
  const tpl = "prefix{{maybe|}}suffix";
  const result = interpolate(tpl, {});
  assert.equal(result.text, "prefixsuffix");
  assert.equal(result.substitutions, 1);
});
