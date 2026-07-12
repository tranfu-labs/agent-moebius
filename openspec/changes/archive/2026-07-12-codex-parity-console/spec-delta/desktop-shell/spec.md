# desktop-shell 规格增量：集成式操作台窗口

## 新增要求

### Requirement: Integrated desktop titlebar

The desktop main window MUST use an integrated titlebar treatment on macOS so the system traffic-light controls visually belong to the console rail instead of occupying a separate white title row.

The renderer MUST provide a safe draggable window region and MUST mark interactive rail controls as non-draggable.

Non-macOS platforms MUST retain usable native window controls and MUST NOT lose project/session navigation or composer access.

The main window MUST preserve its existing minimum size constraints and local-console/runner lifecycle.

#### Scenario: macOS main window uses the integrated frame

- **GIVEN** the desktop application runs on macOS
- **WHEN** the main BrowserWindow is created
- **THEN** it uses the hidden inset titlebar treatment with traffic-light controls positioned over the rail
- **AND** the renderer leaves a draggable region without covering interactive controls.

#### Scenario: Auxiliary status window remains conventional

- **GIVEN** the user opens the diagnostic status page
- **WHEN** its BrowserWindow is created
- **THEN** the integrated console titlebar requirement does not force the auxiliary window to copy the conversation rail frame.
