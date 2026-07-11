# desktop-shell Specification Delta

## ADDED Requirements

### Requirement: Desktop GitHub-mode runner child

The desktop main process MUST start exactly one local console server for the operator console.

The desktop runner child MUST start the shared runner entrypoint in GitHub mode explicitly, rather than relying on the terminal default startup mode.

The desktop runner child MUST NOT start a duplicate local console server when the desktop main process already owns it.

The desktop runner child MUST NOT write local console SQLite session messages while running the GitHub heartbeat.

The desktop renderer MUST continue to use the main process provided local console URL.

#### Scenario: Desktop child keeps GitHub runner after terminal default flips local

- **Given** desktop main process has started its local console server
- **When** the desktop runner child starts
- **Then** it starts the runner entrypoint in GitHub mode
- **And** it does not start another local console server
- **And** it does not write local console SQLite session messages
- **And** the renderer continues to use the main process local console server URL
