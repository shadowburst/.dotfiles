# Yazi Shell Keymap

## Purpose

Provide a fast way to drop from Yazi into the user's configured interactive shell at the directory currently being browsed, then return to the same Yazi session when the shell exits.

## Requirements

### Requirement: Open the user's shell from Yazi

Yazi must provide a manager-mode key binding that opens the user's `$SHELL`.

#### Scenario: User opens a shell from the current Yazi directory

Given the user is browsing a directory in Yazi
When the user presses `!`
Then Yazi opens the program referenced by `$SHELL`
And the shell starts in Yazi's current directory.

### Requirement: Return to Yazi after the shell exits

The shell must run as an interactive blocking command so that Yazi yields the terminal while the shell is active and resumes after the shell exits.

#### Scenario: User exits the shell

Given the user opened `$SHELL` from Yazi using `!`
When the user exits the shell
Then the same Yazi session is visible again
And the user can continue browsing from the previous Yazi context.

### Requirement: Limit the binding to Unix environments

The key binding must be declared for Unix environments only.

#### Scenario: Unix Yazi configuration is generated

Given the Home Manager Yazi configuration is evaluated for a Unix environment
When Yazi receives its keymap configuration
Then the `!` manager-mode binding is available for opening `$SHELL`.

## Implementation Constraints

- Implement the behavior as a Yazi `mgr.prepend_keymap` entry in `modules/terminal/yazi.nix`.
- Use Yazi's built-in `shell` command with blocking behavior.
- Do not add scripts, plugins, wrappers, or external commands for this feature.

## Implementation Context

Yazi documents `!` with `shell "$SHELL" --block` as the standard Unix binding for dropping into the user's shell. The existing dotfiles configuration already manages Yazi keymaps through the Home Manager `programs.yazi.keymap.mgr.prepend_keymap` structure.

## Out of Scope

- Windows or PowerShell support.
- Custom shell selection separate from `$SHELL`.
- Opening a shell in the hovered file's parent directory instead of Yazi's current directory.
- Adding new Yazi plugins or helper scripts.

## Source Context

Planned from the user's request to add a Yazi keymap that “will pop me into my `$SHELL`,” with decisions confirmed interactively for the `!` key, blocking interactive behavior, Unix-only scope, current-directory startup, and keymap-only implementation.
