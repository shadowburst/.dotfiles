# Context

## Glossary

### Scope
A broad configuration boundary that describes where a set of personal system preferences applies, such as baseline setup, shared defaults, terminal environment, graphical desktop, development tooling, work tooling, or a specific machine.

### Feature file
A source file grouped around one feature or tool. A feature file is an implementation unit, not a public configuration boundary.

### Public module API
The small closed set of scope names that host definitions are expected to compose directly.

### Core scope
The essential baseline required by every managed personal interactive machine. This is not a generic server baseline; it includes boring Nix/Home Manager foundation and cross-host personal defaults that should not be optional per host.

### CLI scope
The interactive command-line workspace: shells, terminal utilities, editor, Git, coding agents, and common local development tools.

### GUI scope
The graphical user environment: Wayland/session shell, graphical applications, browser, media applications, audio, printing, and graphical desktop integration.

### Gaming scope
Narrow game-specific support such as Steam, GameMode, Gamescope, game launchers, and game hardware support.

### Laravel scope
The Laravel development stack, including its cohesive CLI, container, payment, and database helper tools.

### Host scope
Everything that makes one machine itself: hardware configuration, boot/storage choices, host-specific services, machine-specific overrides, and host Home Manager tweaks.

### Mutable user state
Personal configuration or data that is intentionally changed by interactive tools during normal use and is not authored as part of the dotfiles source of truth.
