### Requirement: Agent team member initial avatars

Source: docs/product/pages/agent-teams.md#Agent-身份与说明

The Agent Teams surface MUST render the same neutral circular initial-avatar pattern for each member in the team-list member item, the detail member selector, and the current-member heading.

The avatar glyph MUST use the first visible character of the member display name, MUST fall back to the first character of the stable member slug when the display name is unavailable, and MUST uppercase Latin fallback or display initials.

The surface MUST NOT require or persist an image, image path, or separate avatar metadata field for this identity marker.

#### Scenario: Canonical display name supplies the avatar

- **GIVEN** a team member has display name `软件测试` and slug `qa`
- **WHEN** the team list, member selector, and current-member heading render that member
- **THEN** all three surfaces show the neutral circular glyph `软` beside the same readable identity.

#### Scenario: Missing display name falls back to slug

- **GIVEN** an intermediate or unavailable member summary has an empty display name and slug `dev-manager`
- **WHEN** an initial avatar is rendered
- **THEN** the neutral circular glyph is `D`
- **AND** no image or avatar metadata is required.
