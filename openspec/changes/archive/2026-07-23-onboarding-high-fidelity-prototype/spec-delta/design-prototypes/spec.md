# Design Prototypes Specification Delta

### Requirement: Isolated high-fidelity prototype sandbox

The repository MUST keep high-fidelity prototype authoring isolated from product implementation code: prototype source MUST NOT import product runtime or UI packages, and product source MUST NOT import prototype source.

#### Scenario: Production and prototype dependency graphs remain separate

- **GIVEN** the prototype workspace and production workspaces are installed
- **WHEN** source imports are scanned
- **THEN** no import crosses between `prototypes/` and `src/`, `desktop/`, or `packages/`

### Requirement: Self-contained onboarding prototype

Source: `docs/product/pages/onboarding.md#指标与验收`

The onboarding high-fidelity prototype MUST build to one HTML file whose required script, style, image, icon, and font resources are embedded and which MUST open from a local file URL without network access.

#### Scenario: Reviewer opens the artifact offline

- **GIVEN** `docs/product/pages/onboarding.prototype.html`
- **WHEN** a reviewer opens it without a development server or network access
- **THEN** the four onboarding steps render and remain interactive
- **AND** no required resource request leaves the local file

### Requirement: Complete interactive onboarding journey

Source: `docs/product/pages/onboarding.md#操作与反馈`

The prototype MUST enforce the environment hard gate, carry the selected team through the journey, allow the relay demonstration to be replayed or skipped by continuing, and finish in a new-conversation state that visibly retains the selected team.

#### Scenario: Happy path reaches new conversation

- **GIVEN** the environment check passes and a team is selected
- **WHEN** the reviewer activates each primary action through step four
- **THEN** the prototype shows the new-conversation destination
- **AND** the destination displays the selected team

#### Scenario: Missing Codex blocks progress

- **GIVEN** the missing-Codex review scenario
- **WHEN** step one is shown
- **THEN** the primary continue action is disabled
- **AND** a recheck action can restore the ready state without reloading

### Requirement: Motion remains optional

Source: `docs/product/pages/onboarding.md#第-3-步重播与继续`

The prototype MUST present equivalent relay order and current-member information when reduced motion is requested, without relying on continuous spatial movement.

#### Scenario: Reduced-motion reviewer follows the relay

- **GIVEN** reduced motion is active
- **WHEN** the relay demonstration runs
- **THEN** each relay stage remains identifiable through static highlight and content changes
- **AND** the reviewer can replay or continue normally
