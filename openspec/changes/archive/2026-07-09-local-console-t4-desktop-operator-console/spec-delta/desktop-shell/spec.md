# desktop-shell spec delta：local-console-t4-desktop-operator-console

T4 changes the desktop shell's default user-facing window from a diagnostic status page to the local operator console. Diagnostic status and observer remain available as auxiliary tools.

## 新增行为规则

### 操作台主窗口
- MUST load the desktop operator console as the default BrowserWindow content after application boot.
- MUST keep status and observer diagnostics reachable from the operator console, but they must not be the default main-window experience.
- MUST expose the local console server URL or equivalent local API capability to the renderer through preload, not through global Node integration.
- MUST keep context isolation enabled and node integration disabled for renderer windows.

### local console server ownership
- MUST ensure desktop mode starts exactly one local console server for the operator console.
- SHOULD let the Electron main process own the local console server lifecycle so renderer reloads do not destroy active local runs.
- MUST prevent the runner child from starting a duplicate local console server when the desktop main process already owns it.
- MUST close the local console server during desktop shutdown along with runner and observer.

### 诊断入口
- MUST retain actions for opening observer, opening data root, checking updates, and viewing runner/doctor status through an auxiliary diagnostic surface.
- MUST keep runner child supervision, crash backoff, data root seeding, PATH repair, and environment doctor behavior intact.

## 新增场景

### 场景 DS-T4.1：主窗口默认是操作台
Given the desktop app has finished booting
When the main BrowserWindow finishes loading
Then it displays the local operator console
And the user can reach status/observer diagnostics from an auxiliary action.

### 场景 DS-T4.2：桌面形态只有一个 local console server
Given desktop main process starts a local console server
When runner child starts
Then runner child does not start a second local console server
And the renderer uses the main process provided local console URL.

### 场景 DS-T4.3：renderer 安全边界保持
Given the operator console renderer is loaded
When it needs to submit messages, interrupt runs, or read state
Then it uses preload-exposed APIs or loopback HTTP endpoints
And it does not enable Node integration.

