# Phase 12 product usability

Phase 12 closes the baseline product-usability gap in Q1X Community Orchestrator. The Community Orchestrator is a standalone product: its local runtime owns mission state, connector configuration, approvals, evidence, audit, recovery and supervision. Ordinary baseline use requires no Q1X code development and no private Quoralinex service.

The currently commissioned public alpha, `v0.1.0-alpha.1`, remains immutable. Phase 12 is implemented on protected `main` and produced the separately governed `v0.1.0-alpha.2` package candidate with the first-party desktop bridges and the connector/doctor usability layer described here. The candidate has passed exact-head and post-merge commissioning validation but is not yet released and awaits explicit manual commissioning. The project remains experimental and is not production-ready or generally available.

## Baseline setup

After installation, initialize a local runtime and inspect the built-in connector catalogue:

```bash
q1x --home .q1x init
q1x --home .q1x connectors list
q1x --home .q1x doctor --json
```

A connector is configured through public CLI commands rather than by editing runtime source:

```bash
q1x --home .q1x connectors add <connector-id>
q1x --home .q1x connectors configure <connector-id> --parameter key=value
q1x --home .q1x connectors test <connector-id>
q1x --home .q1x connectors enable <connector-id>
q1x --home .q1x connectors apply <connector-id>
```
## Baseline capabilities

| Capability | Shipped baseline | Ordinary prerequisite | Verification path |
| --- | --- | --- | --- |
| Model transport | OpenAI-compatible Chat Completions, OpenAI-compatible Responses and Anthropic-compatible Messages profiles | A local model service, or a hosted HTTPS endpoint plus any required API key/credential environment variable | `q1x connectors test <model-id>` then `q1x model invoke ...` |
| MCP | stdio and Streamable HTTP starter profiles | A local MCP command or public MCP HTTPS service, plus service credentials where required | `q1x connectors test <mcp-id>` then adapter discovery/call |
| A2A | Agent Card discovery and JSON-RPC `message/send` profile | A reachable A2A service and any service credentials it requires | connector test, adapter discovery and execution |
| Local CLI | JSON stdio and text stdio profiles | The selected executable installed locally | connector test and adapter execution |
| Browser | Managed Chromium-family control and explicit CDP attachment | A supported Chromium-family browser installed by the operator, or an authorized CDP endpoint | connector test then `q1x browser run ...` |
| Desktop | First-party macOS, Windows and Linux bridge packages | Host OS permission/session prerequisites described below | bridge `--doctor`, `q1x doctor --json`, then desktop execution |

These are protocol and product-surface claims, not universal provider/application compatibility claims. Provider-specific combinations remain unclaimed unless the compatibility matrix cites exact evidence for that combination.

## Desktop prerequisites

The governed Phase 12 package set ships first-party desktop bridges for all three target operating systems:

- **macOS:** Accessibility-based bridge. The process that launches Q1X must have macOS Accessibility permission in System Settings.
- **Windows:** Windows UI Automation bridge. Elevated or otherwise protected application boundaries can remain inaccessible and Q1X does not request UAC elevation automatically.
- **Linux:** AT-SPI bridge. Python 3, PyGObject/AT-SPI and an accessibility-enabled graphical session are required. Wayland compositor policy can restrict global input or screenshot operations.

`q1x doctor --json` and each bridge's `--doctor` command report `ok`, `warning`, `blocked`, `unsupported` or `not-configured` with remediation. A blocked OS permission is not converted into a false success result.
## Credentials and external services

Q1X stores connector configuration and environment-variable references, not secret values. A hosted model, MCP or A2A service can require its own credential, but that credential remains an operator-supplied environment value and is not a dependency on a Quoralinex-private service.

Remote model and MCP endpoints must satisfy the runtime transport-security rules. Local loopback services remain valid for zero-provider-bill development and deterministic testing.

## Evidence boundary

Phase 12 CI exercises no-custom-code model, MCP, A2A, CLI and managed-browser flows and captures operating-system-specific desktop evidence on Ubuntu, macOS and Windows. The compatibility matrix promotes only the exact surfaces backed by repository-verifiable evidence.

The macOS and Windows runner evidence includes deterministic native-bridge harnesses and host doctor output. It does not claim that every physical desktop application, permission configuration, elevated process or OS version has been tested. Linux has a virtual X11/AT-SPI accessibility-session path in CI; other desktop environments and Wayland policies need separate evidence.

## Extension boundary

The Community Adapter SDK, custom desktop backends and other public extension points remain available for integrations beyond the shipped baseline. Extension interfaces are not substitutes for the first-party baseline described above, and third-party adapter conformance is not a sandbox or trust certificate.
