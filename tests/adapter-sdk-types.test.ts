import type {
  AdapterEndpoint,
  CapabilityDescriptor,
  ExecutionRequest,
  ExecutionResult,
} from '@quoralinex/q1x-community-sdk';
import {
  ADAPTER_SDK_VERSION,
  createAdapterCompatibility,
  defineCommunityAdapter,
  type AdapterCompatibility,
  type AdapterSdkVersion,
  type CommunityAdapter,
  type CommunityAdapterContext,
} from '@quoralinex/q1x-community-adapter-sdk';

const sdkVersion: AdapterSdkVersion = ADAPTER_SDK_VERSION;
const compatibility: AdapterCompatibility = createAdapterCompatibility();
const context: CommunityAdapterContext = { signal: new AbortController().signal, env: {}, fetch: globalThis.fetch };

const adapter: CommunityAdapter = defineCommunityAdapter({
  protocol: 'community.echo',
  compatibility,
  async execute(endpoint: AdapterEndpoint, request: ExecutionRequest, executionContext?: CommunityAdapterContext): Promise<ExecutionResult> {
    void endpoint;
    void executionContext;
    return {
      contractVersion: '1.0.0',
      id: 'result.type-test',
      requestId: request.id,
      workItemId: request.workItemId,
      status: 'succeeded',
      output: request.input,
      startedAt: request.createdAt,
      finishedAt: request.createdAt,
    };
  },
  async discover(endpoint: AdapterEndpoint): Promise<readonly CapabilityDescriptor[]> {
    void endpoint;
    return [];
  },
});

void sdkVersion;
void context;
void adapter;
