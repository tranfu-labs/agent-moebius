# console-ui delta：local-console-t5-child-session-orchestration

## ADDED Requirements

### Requirement: Parent-child session sidebar tree
The console UI MUST render sessions as a project -> parent session -> child session tree when parent session ids are available.

The console UI MUST keep root session selection and child session selection controlled by the same selected session id.

The console UI MUST restore the same parent-child tree after refresh from session summary data alone.

The console UI MUST keep child session rows compact, indented, and scannable with title and status visible.

The console UI MUST render child sessions with missing parent summaries as visible root fallback rows rather than dropping them.

The console UI MUST render each session at most once even when parent session references are cyclic, self-referential, or otherwise corrupt.

The console UI MUST bound parent tree construction so corrupt parent references cannot hang rendering.

#### Scenario: Sidebar renders persisted child sessions
Given a project has a parent session and two child sessions whose `parentSessionId` references the parent
When the operator console sidebar renders
Then the two child sessions appear under the parent session
And selecting a child session calls the normal session selection callback with that child session id.

#### Scenario: Refresh keeps tree hierarchy
Given the operator console receives the same flat session summaries after a renderer refresh
When the sidebar renders again
Then the child sessions still appear under the same parent session
And their order and selected state remain stable.

#### Scenario: Corrupt parent chain remains visible and bounded
Given flat session summaries contain a parent cycle or self-parent reference
When the operator console sidebar renders
Then rendering completes
And each session appears at most once
And sessions that cannot be safely attached are shown as root fallback rows.
