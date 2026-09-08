import { assertCommunityAdapter, type CommunityAdapter, type CommunityAdapterContext } from '@quoralinex/q1x-community-adapter-sdk';

import type { AdapterTransport, AdapterTransportContext } from './adapter-transport.js';

function communityContext(context: AdapterTransportContext = {}): CommunityAdapterContext {
  return {
    ...(context.signal ? { signal: context.signal } : {}),
    ...(context.env ? { env: context.env } : {}),
    ...(context.fetch ? { fetch: context.fetch } : {}),
  };
}

export function communityAdapterTransport(adapter: CommunityAdapter): AdapterTransport {
  assertCommunityAdapter(adapter);
  return {
    protocol: adapter.protocol,
    execute(endpoint, request, context) {
      return adapter.execute(endpoint, request, communityContext(context));
    },
    ...(adapter.discover
      ? {
          discover(endpoint, context) {
            return adapter.discover!(endpoint, communityContext(context));
          },
        }
      : {}),
  };
}
