# Q1X Windows Desktop Bridge

`@quoralinex/q1x-community-desktop-bridge-windows` is the first-party Windows UI Automation bridge for Q1X Community Orchestrator.

It implements the existing `q1x-desktop-bridge/1` stdin/stdout protocol and is intended to be launched by the Community runtime's `stdio-bridge` backend. Normal use does not require compiling bridge code.

## Requirements

- Windows desktop session;
- Node.js 24 or later;
- Windows PowerShell 5.1+ or PowerShell 7+;
- .NET UI Automation assemblies available in the Windows session.

Check readiness without changing UI state:

```powershell
q1x-desktop-bridge-windows --doctor --json
```

The bridge uses a fixed encoded PowerShell worker and passes the Q1X request separately through stdin. It does not interpolate user values into a shell command, alter PowerShell execution policy, use `runas`, or request UAC elevation.

Windows integrity boundaries still apply. An unelevated Q1X process may be unable to automate an elevated target application. In that case the bridge reports the target as blocked; it does not elevate itself.

The bridge uses Windows UI Automation for application/window and accessibility element operations, `SendKeys`/user32 input APIs for ordinary keyboard and pointer operations, and .NET drawing APIs for screenshots.

This bridge is entirely local to the Community Orchestrator and the Windows host. It has no private service dependency.

This package is experimental public-alpha software and is licensed under PolyForm Noncommercial License 1.0.0.
