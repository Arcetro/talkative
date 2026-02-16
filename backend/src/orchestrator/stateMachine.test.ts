import test from "node:test";
import assert from "node:assert/strict";
import { reduceRunStatus, reduceSubagentState } from "./stateMachine.js";

test("state machine transitions run and subagent states", () => {
  let run = reduceRunStatus("pending", { command: "start_task" });
  let sub = reduceSubagentState("idle", { command: "start_task" });
  assert.equal(run, "running");
  assert.equal(sub, "running");

  run = reduceRunStatus(run, { command: "pause" });
  sub = reduceSubagentState(sub, { command: "pause" });
  assert.equal(run, "paused");
  assert.equal(sub, "paused");

  run = reduceRunStatus(run, { command: "resume" });
  sub = reduceSubagentState(sub, { command: "resume" });
  assert.equal(run, "running");
  assert.equal(sub, "running");

  run = reduceRunStatus(run, { event: "error_compacted" });
  sub = reduceSubagentState(sub, { event: "error_compacted" });
  assert.equal(run, "failed");
  assert.equal(sub, "error");
});
