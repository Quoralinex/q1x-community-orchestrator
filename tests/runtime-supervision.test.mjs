import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

async function runtimeModule() {
  return import("../packages/runtime/dist/index.js");
}

const now = "2026-09-07T20:00:00Z";

function capability(overrides = {}) {
  return {
    contractVersion: "1.0.0",
    id: "capability.local.worker",
    name: "Local worker",
    adapterKind: "cli-tui",
    operations: ["execute"],
    modalities: { input: ["structured-data"], output: ["structured-data"] },
    availability: { state: "available", checkedAt: now },
    cost: { class: "no-usage-fee" },
    privacy: { executionLocation: "local", dataRetention: "none" },
    trust: { level: "validated", validatedAt: now },
    platforms: ["linux", "macos", "windows"],
    ...overrides
  };
}

function binding(overrides = {}) {
  return {
    contractVersion: "1.0.0",
    id: "binding.local.worker",
    capabilityId: "capability.local.worker",
    executorKind: "external",
    operations: ["execute"],
    enabled: true,
    priority: 10,
    ...overrides
  };
}

function mission() {
  return {
    contractVersion: "1.0.0",
    id: "mission.phase7",
    title: "Deliver a governed programme",
    objective: "Complete dependent work through capability-based supervision",
    status: "active",
    outcomes: [{ id: "outcome.phase7", description: "Programme completed", successCriteria: ["All work completed"] }],
    constraints: [],
    createdAt: now,
    updatedAt: now
  };
}

function programme() {
  return {
    contractVersion: "1.0.0",
    id: "programme.phase7",
    missionId: "mission.phase7",
    revision: 1,
    status: "active",
    workstreams: [{ id: "workstream.phase7", title: "Delivery", objective: "Deliver work", status: "active" }],
    createdAt: now,
    updatedAt: now
  };
}

function graph() {
  return {
    contractVersion: "1.0.0",
    id: "graph.phase7",
    programmeId: "programme.phase7",
    revision: 1,
    nodes: [
      {
        id: "task.first",
        kind: "task",
        title: "First task",
        parentId: "workstream.phase7",
        status: "ready",
        capabilityRequirements: [{ operation: "execute", adapterKinds: ["cli-tui"], inputModalities: ["structured-data"], outputModalities: ["structured-data"] }]
      },
      {
        id: "task.second",
        kind: "task",
        title: "Second task",
        parentId: "workstream.phase7",
        status: "pending",
        capabilityRequirements: [{ operation: "execute", adapterKinds: ["cli-tui"] }]
      }
    ],
    edges: [{ from: "task.first", to: "task.second", type: "depends-on" }],
    updatedAt: now
  };
}

const policy = {
  contractVersion: "1.0.0",
  id: "policy.phase7",
  maxConcurrentAssignments: 2,
  maxAttemptsPerWorkItem: 2,
  preferNoUsageFee: true,
  preferLocal: true,
  allowUnknownCost: false,
  stopConditions: ["completed", "idle", "blocked", "approval-required", "budget-exhausted", "replan-required"]
};

test("allocator hard-gates requirements and orders eligible capabilities deterministically", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "q1x-phase7-rank-"));
  const { OpenControlRuntime } = await runtimeModule();
  const runtime = OpenControlRuntime.open({ home });
  const local = capability();
  const remote = capability({
    id: "capability.remote.worker",
    name: "Remote worker",
    cost: { class: "metered", currency: "EUR", unitCost: 0.25, unit: "execution" },
    privacy: { executionLocation: "public-cloud", dataRetention: "provider-policy" },
    trust: { level: "configured" }
  });
  runtime.putCapability(remote);
  runtime.putCapability(local);
  runtime.putExecutionBinding(binding());
  runtime.putExecutionBinding(binding({ id: "binding.remote.worker", capabilityId: remote.id, priority: 10 }));

  const ranked = runtime.rankCapabilities({ operations: ["execute"], adapterKinds: ["cli-tui"] }, policy);
  assert.deepEqual(ranked.map(candidate => candidate.capability.id), [local.id, remote.id]);
  assert.deepEqual(
    runtime.rankCapabilities({ operations: ["execute"], adapterKinds: ["cli-tui"], localOnly: true }, policy).map(candidate => candidate.capability.id),
    [local.id]
  );
  runtime.close();
  await rm(home, { recursive: true, force: true });
});

test("team formation persists logical specialists and assignments across restart", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "q1x-phase7-team-"));
  const { OpenControlRuntime } = await runtimeModule();
  let runtime = OpenControlRuntime.open({ home });
  runtime.putMission(mission());
  runtime.putProgramme(programme());
  runtime.putWorkGraph(graph());
  runtime.putCapability(capability());
  runtime.putExecutionBinding(binding());

  const team = runtime.formTeam("programme.phase7", { policy });
  assert.equal(team.members.length, 1);
  assert.equal(team.members[0].workItemIds[0], "task.first");
  const assignments = runtime.listWorkAssignments("programme.phase7");
  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].attempt, 1);
  assert.equal(assignments[0].bindingId, "binding.local.worker");
  runtime.close();

  runtime = OpenControlRuntime.open({ home });
  assert.equal(runtime.getTeamPlan(team.id)?.id, team.id);
  assert.equal(runtime.listWorkAssignments("programme.phase7")[0].workItemId, "task.first");
  assert.equal(runtime.getStatus("programme.phase7").counts.teamPlans, 1);
  runtime.close();
  await rm(home, { recursive: true, force: true });
});

test("supervision executes ready work, advances dependencies and converges without persisting execution input", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "q1x-phase7-supervise-"));
  const { OpenControlRuntime } = await runtimeModule();
  const runtime = OpenControlRuntime.open({ home });
  runtime.putMission(mission());
  runtime.putProgramme(programme());
  runtime.putWorkGraph(graph());
  runtime.putCapability(capability());
  runtime.putExecutionBinding(binding());
  const seenInputs = [];
  runtime.registerWorkExecutor("external", {
    id: "test.external",
    async execute(context) {
      seenInputs.push(context.input);
      return { status: "succeeded", usage: { durationMs: 1 } };
    }
  });

  const result = await runtime.superviseUntilStop("programme.phase7", policy, {
    maxCycles: 4,
    inputsByWorkItem: {
      "task.first": { secretLikeEphemeralValue: "not-persisted" },
      "task.second": { value: 2 }
    }
  });
  assert.equal(result.stopReason, "completed");
  assert.equal(runtime.getWorkGraph("graph.phase7").nodes.every(node => node.status === "completed"), true);
  assert.equal(runtime.listSupervisionCycles("programme.phase7").length, 2);
  assert.deepEqual(seenInputs, [{ secretLikeEphemeralValue: "not-persisted" }, { value: 2 }]);
  assert.equal(JSON.stringify(runtime.listWorkAssignments("programme.phase7")).includes("not-persisted"), false);
  runtime.close();
  await rm(home, { recursive: true, force: true });
});

test("planner proposals are validated before accepted replans and create a checkpoint", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "q1x-phase7-plan-"));
  const { OpenControlRuntime, RuntimeError } = await runtimeModule();
  const runtime = OpenControlRuntime.open({ home });
  runtime.putMission(mission());
  runtime.putProgramme(programme());
  runtime.putWorkGraph(graph());
  const proposedProgramme = { ...programme(), revision: 2, updatedAt: "2026-09-07T20:05:00Z" };
  const proposedGraph = { ...graph(), revision: 2, updatedAt: "2026-09-07T20:05:00Z" };
  const proposal = {
    contractVersion: "1.0.0",
    id: "proposal.phase7.replan",
    missionId: "mission.phase7",
    programme: proposedProgramme,
    workGraph: proposedGraph,
    assumptions: ["Current work remains valid"],
    rationale: "Refresh the programme after new evidence",
    plannerStrategyId: "manual",
    proposedAt: "2026-09-07T20:05:00Z"
  };

  assert.equal(runtime.validateProgrammeProposal(proposal).valid, true);
  const accepted = runtime.acceptProgrammeProposal(proposal, { checkpointBeforeApply: true });
  assert.equal(accepted.programme.revision, 2);
  assert.equal(accepted.workGraph.revision, 2);
  assert.equal(runtime.listCheckpoints("programme.phase7").length, 1);
  assert.throws(
    () => runtime.validateProgrammeProposal({ ...proposal, missionId: "mission.other" }, { throwOnInvalid: true }),
    RuntimeError
  );
  runtime.close();
  await rm(home, { recursive: true, force: true });
});
