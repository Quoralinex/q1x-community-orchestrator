import type { Mission, Programme, ProgrammeProposal, SupervisionCycle, SupervisionPolicy, WorkGraph } from '@quoralinex/q1x-community-sdk';

export interface PlanningContext {
  mission: Mission;
  programme?: Programme;
  workGraph?: WorkGraph;
  policy?: SupervisionPolicy;
  recentCycles?: SupervisionCycle[];
  evidence?: unknown[];
}

export interface PlanningStrategy {
  id: string;
  propose(context: PlanningContext): Promise<ProgrammeProposal> | ProgrammeProposal;
}
