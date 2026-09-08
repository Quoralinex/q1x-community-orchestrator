import {
  createAdapterCompatibility,
  defineCommunityAdapter,
} from '@quoralinex/q1x-community-adapter-sdk';

export const communityEchoAdapter = defineCommunityAdapter({
  protocol: 'community.echo',
  compatibility: createAdapterCompatibility(),
  async execute(_endpoint, request) {
    return {
      contractVersion: '1.0.0',
      id: `result.${request.id}`,
      requestId: request.id,
      workItemId: request.workItemId,
      status: 'succeeded',
      output: request.input,
      startedAt: request.createdAt,
      finishedAt: request.createdAt,
    };
  },
  async discover() {
    return [{
      contractVersion: '1.0.0',
      id: 'capability.community.echo.reference',
      name: 'Community echo reference adapter',
      adapterKind: 'cli-tui',
      operations: ['community.echo'],
      modalities: {
        input: ['structured-data'],
        output: ['structured-data'],
      },
      availability: {
        state: 'available',
        checkedAt: '2026-09-08T16:00:00.000Z',
      },
      cost: { class: 'no-usage-fee' },
      privacy: {
        executionLocation: 'local',
        dataRetention: 'none',
      },
      trust: {
        level: 'validated',
        source: 'examples/community-adapter',
      },
      platforms: ['any'],
    }];
  },
});
