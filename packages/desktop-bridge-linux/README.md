# Q1X Linux Desktop Bridge

`@quoralinex/q1x-community-desktop-bridge-linux` is the first-party Linux AT-SPI desktop bridge for Q1X Community Orchestrator.

It implements `q1x-desktop-bridge/1` through a Node.js executable and a bundled Python 3 GI/AT-SPI worker. Normal use does not require writing or compiling bridge code.

## Requirements

- Linux graphical desktop session;
- Node.js 24 or later;
- Python 3;
- PyGObject plus AT-SPI 2 GI bindings (commonly distribution packages such as `python3-gi` and `gir1.2-atspi-2.0`);
- an accessibility-enabled desktop session and session bus.

Check readiness without changing UI state:

```bash
q1x-desktop-bridge-linux --doctor --json
```

The bridge uses direct process execution with `shell: false`. It does not install OS packages, request root privileges, modify accessibility settings or connect to a private service.

AT-SPI semantic actions are the preferred control path. X11 normally permits broader synthesized input. Wayland compositor policy may restrict global pointer, keyboard or screenshot synthesis even when semantic AT-SPI actions work; `--doctor` reports that distinction instead of claiming universal Linux support.

Screenshot capture uses an already installed supported utility (`gnome-screenshot`, `grim` or `scrot`) and never invokes it through a shell.

This package is experimental public-alpha software and is licensed under PolyForm Noncommercial License 1.0.0.
