# Community Adapter Reference Template

This example implements a deterministic local `community.echo` adapter using `@quoralinex/q1x-community-adapter-sdk`.

The adapter is intentionally small. It echoes the supplied execution input and exposes one local capability. It makes **no network calls**, declares no secret-management dependency, and does not depend on browser automation or native desktop control.

## Build and test

From the repository root:

```bash
npx tsc -p examples/community-adapter/tsconfig.json
node --test examples/community-adapter/test/adapter.test.mjs
```

The public conformance runner validates adapter metadata, execution-result shape, discovery output and fixture immutability. Passing conformance demonstrates compatibility with the public adapter contract; it is **not a sandbox**, security review, code-signing mechanism or statement that an arbitrary third-party adapter is trusted.

## Registration

Community adapters are never auto-loaded. Installation and registration are explicit, operator-controlled actions. A host application imports the adapter, converts it through the runtime `communityAdapterTransport(...)` bridge and supplies that transport to `OpenControlRuntime.open({ adapterTransports: [...] })` or registers it through the existing transport registry surface.

Operators remain responsible for reviewing adapter source, dependencies, permissions, data handling and any credentials or external endpoints the adapter may use. This reference adapter itself uses no network access and no credentials.

## Licence

This public repository and reference template are provided under the **PolyForm Noncommercial License 1.0.0**. Review the repository `LICENSE` before reuse or redistribution.
