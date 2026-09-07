import type { CapabilityDescriptor, CapabilityRoutingRequirements, ExecutionBinding, SupervisionPolicy } from '@quoralinex/q1x-community-sdk';

const trustRank: Record<string, number> = {
  unverified: 0,
  discovered: 1,
  configured: 2,
  validated: 3,
  trusted: 4
};

function includesAll<T>(available: readonly T[], required: readonly T[] | undefined): boolean {
  return !required || required.every(value => available.includes(value));
}

function isKnownNoFee(capability: CapabilityDescriptor): boolean {
  return capability.cost.class === 'no-usage-fee';
}

function unitCost(capability: CapabilityDescriptor): number {
  if (isKnownNoFee(capability)) return 0;
  return capability.cost.unitCost ?? Number.POSITIVE_INFINITY;
}

export function bindingMatches(binding: ExecutionBinding, capability: CapabilityDescriptor, requirements: CapabilityRoutingRequirements, policy: SupervisionPolicy): boolean {
  if (!binding.enabled || binding.capabilityId !== capability.id) return false;
  if (!['available', 'degraded'].includes(capability.availability.state)) return false;
  if (!includesAll(binding.operations, requirements.operations)) return false;
  if (!includesAll(capability.operations, requirements.operations)) return false;
  if (requirements.adapterKinds && !requirements.adapterKinds.includes(capability.adapterKind)) return false;
  if (!includesAll(capability.modalities.input, requirements.inputModalities)) return false;
  if (!includesAll(capability.modalities.output, requirements.outputModalities)) return false;
  if (requirements.localOnly && capability.privacy.executionLocation !== 'local') return false;
  const minimumTrust = requirements.minimumTrust ?? policy.minimumTrust;
  if (minimumTrust && (trustRank[capability.trust.level] ?? -1) < (trustRank[minimumTrust] ?? 0)) return false;
  if (policy.allowedExecutionLocations && !policy.allowedExecutionLocations.includes(capability.privacy.executionLocation)) return false;
  if (policy.allowUnknownCost === false && capability.cost.class === 'unknown') return false;
  return true;
}

export function rankBoundCapabilities(
  capabilities: CapabilityDescriptor[],
  bindings: ExecutionBinding[],
  requirements: CapabilityRoutingRequirements,
  policy: SupervisionPolicy
): Array<{ capability: CapabilityDescriptor; binding: ExecutionBinding }> {
  const capabilityById = new Map(capabilities.map(capability => [capability.id, capability]));
  return bindings
    .map(binding => ({ binding, capability: capabilityById.get(binding.capabilityId) }))
    .filter((candidate): candidate is { binding: ExecutionBinding; capability: CapabilityDescriptor } =>
      candidate.capability !== undefined && bindingMatches(candidate.binding, candidate.capability, requirements, policy))
    .sort((left, right) => {
      const priority = (right.binding.priority ?? 0) - (left.binding.priority ?? 0);
      if (priority !== 0) return priority;
      if (policy.preferNoUsageFee) {
        const noFee = Number(isKnownNoFee(right.capability)) - Number(isKnownNoFee(left.capability));
        if (noFee !== 0) return noFee;
      }
      if (policy.preferLocal) {
        const local = Number(right.capability.privacy.executionLocation === 'local') - Number(left.capability.privacy.executionLocation === 'local');
        if (local !== 0) return local;
      }
      const trust = (trustRank[right.capability.trust.level] ?? -1) - (trustRank[left.capability.trust.level] ?? -1);
      if (trust !== 0) return trust;
      const cost = unitCost(left.capability) - unitCost(right.capability);
      if (cost !== 0) return cost;
      const availability = Number(right.capability.availability.state === 'available') - Number(left.capability.availability.state === 'available');
      if (availability !== 0) return availability;
      const capabilityId = left.capability.id.localeCompare(right.capability.id);
      return capabilityId !== 0 ? capabilityId : left.binding.id.localeCompare(right.binding.id);
    });
}

export function knownCapabilityCost(capability: CapabilityDescriptor): number | undefined {
  if (capability.cost.class === 'no-usage-fee') return 0;
  return capability.cost.unitCost;
}
