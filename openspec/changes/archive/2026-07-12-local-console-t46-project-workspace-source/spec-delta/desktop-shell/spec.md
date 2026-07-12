# desktop-shell spec delta：local-console-t46-project-workspace-source

T4.6 adds a desktop shell entry point for opening local folders as projects. The shell remains an assembly layer: it may show the native folder picker and pass the selected path to the local console renderer, but project persistence and runtime cwd selection stay in `local-console`.

## 新增行为规则

### Project folder picker
- MUST expose a narrow preload IPC for selecting a local folder.
- MUST implement the folder picker in the Electron main process using the native open-directory dialog or equivalent platform folder selection capability.
- MUST return only the selected folder path or null to the renderer.
- MUST NOT write project rows, edit configuration, start Codex, call GitHub, or call `gh` inside the folder picker IPC.
- MUST keep context isolation enabled and node integration disabled for renderer windows.

### Operator console integration
- MUST keep the operator console as the default main-window content.
- MUST let the renderer use the local console API to persist the selected folder as a project.
- MUST keep status and observer diagnostics reachable without making them the default flow.

## 新增场景

### 场景 DS.T4.4：打开文件夹入口只返回路径
Given the desktop operator console is loaded
When the user chooses the open-folder action
Then the Electron main process opens a native directory picker
And preload returns the selected folder path to the renderer
And the IPC does not write SQLite, configuration, or runner state by itself.

### 场景 DS.T4.5：renderer 仍走安全边界
Given the renderer has received a selected folder path
When it creates or updates a local project
Then it calls the loopback local console API
And it does not use Node integration or direct filesystem access.
