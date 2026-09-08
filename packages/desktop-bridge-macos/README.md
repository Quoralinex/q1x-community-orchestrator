# Q1X macOS Desktop Bridge

`@quoralinex/q1x-community-desktop-bridge-macos` is the first-party macOS Accessibility bridge for Q1X Community Orchestrator.

It implements the existing `q1x-desktop-bridge/1` stdin/stdout protocol and is intended to be launched by the Community runtime's `stdio-bridge` backend. Normal use does not require compiling bridge code.

## Requirements

- macOS;
- Node.js 24 or later;
- the built-in `/usr/bin/osascript` runtime;
- Accessibility permission for the terminal/service process that launches Q1X when native UI automation is required.

Check readiness without changing UI state:

```bash
q1x-desktop-bridge-macos --doctor --json
```

If Accessibility access is blocked, grant it in **System Settings > Privacy & Security > Accessibility**. The bridge does not attempt to bypass or automate that permission decision.

The bridge uses a fixed JXA worker via `/usr/bin/osascript` and direct process invocation. Screenshot capture uses `/usr/sbin/screencapture`. It does not invoke a shell or request privilege elevation.

This package is experimental public-alpha software and is licensed under PolyForm Noncommercial License 1.0.0.
