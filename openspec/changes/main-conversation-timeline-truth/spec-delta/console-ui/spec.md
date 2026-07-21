# console-ui delta：main-conversation-timeline-truth

本 delta 只登记足以让机器判定「是否符合」的行为规则；产品意图与视觉细节以 `docs/product/pages/main-conversation.md` 为唯一事实源。

## 修改行为规则

### Requirement: Conversation status dot semantics

Source: docs/product/pages/main-conversation.md#操作与反馈

原 Requirement 的三个事实来源（`needsHuman` / `hasUnreadResult` / `isRunning`）中，前两个的判据被整体替换。优先级与「不依赖颜色」的约束保留。

- MUST derive at most one status dot per session row and per collapsed project row.
- MUST render `red` when the conversation has an unresolved fact of kind 没跑起来, 一步卡住, or 反复重试仍未成功, **or** when the conversation is in one of the three non-continuable states.
- MUST render `blue` when no member is working, the last message mentions no one, and the user has not yet seen those results.
- MUST keep the existing clearing behaviour for `blue`: opening the conversation and successfully showing the latest result clears it. Deriving `blue` from the appearance condition alone MUST NOT be done, since neither condition changes when the user opens the conversation.
- MUST render `blink` when a member is working and no `red` condition holds.
- MUST render `red` and the non-continuable read-only presentation at the same time; they are not mutually exclusive.
- MUST render no dot otherwise, including when the last message mentions a member (团队内部仍在传递), when the user stopped the current step, and when the conversation completed normally.
- MUST NOT treat「等人回话」/ agent-requested human adjudication as a source of `red`. PRD 把「成员主动声明需要用户裁决」记入待讨论，本域 MUST NOT 代为拍板。
- MUST NOT surface any wording equivalent to 等你回话, and MUST NOT add extra visual elements for it.
- MUST apply the priority `red > blue > blink > none`.
- MUST NOT rely on color alone; accessible names remain `需要你处理` / `有新结果` / `正在运行`.
- MUST guarantee that every condition producing `red` corresponds to a visible system record in that conversation explaining what happened; MUST NOT provide any path that sets `red` without such a record.

#### Scenario: Stopping does not summon the user back

- **GIVEN** the user stopped the current step and no other fact holds
- **WHEN** the sidebar renders that session row
- **THEN** no dot is shown.

#### Scenario: Internal handoff is neither red nor blue

- **GIVEN** no member is working and the last message mentions a member
- **WHEN** the sidebar renders that session row
- **THEN** no dot is shown.

#### Scenario: Red always has something to read

- **GIVEN** a session row shows the red dot
- **WHEN** the user opens that conversation
- **THEN** a system record stating what happened is present in the timeline.

#### Scenario: A blocked conversation still calls the user back

- **GIVEN** a conversation whose project folder became unavailable
- **WHEN** the sidebar renders that session row
- **THEN** the red dot is shown
- **AND** opening the conversation shows the read-only presentation with its repair action.

#### Scenario: Blue clears on viewing

- **GIVEN** a session row shows the blue dot
- **WHEN** the user opens that conversation and the latest result is shown
- **THEN** the blue dot is cleared
- **AND** it does not return while nothing new arrives.

### Requirement: Codex-native single-stream operator console

Source: docs/product/pages/main-conversation.md#区域与信息

原 Requirement 保留；下列规则收紧其中与过程标记、计时和运行操作条有关的部分。

- MUST NOT render per-step lifecycle labels or icons such as 已完成, 未开始, 进行中, 已显示, 已交棒 anywhere in the timeline.
- MUST NOT render elapsed time or any timer on an active run.
- MUST attach the run action bar only to the record of the member currently working, and MUST offer 停下 there.
- MUST remove the action bar when that step ends, leaving no trace in history.
- MUST show timestamps only on hover.
- MUST NOT render an aggregate passed/running/waiting counter on the conversation surface.
- MUST stream a working member's output live, without folding or summarizing it.

#### Scenario: A finished step leaves no operating trace

- **GIVEN** a member's step has ended
- **WHEN** the timeline renders that record
- **THEN** no action bar, status label, or elapsed time is attached to it.

### Requirement: Needs-repair propagation to the sidebar entry

Source: docs/product/pages/main-conversation.md#页面状态

原 Requirement 保留；补充「团队已删除」作为独立于「需要修复」的状态。

- MUST distinguish 团队已删除 from 团队需要修复 in the conversation surface, and MUST NOT present a deleted team as repairable.
- MUST offer team reselection as the recovery action for 团队已删除, presented on the team context control itself.
- MUST restore the conversation's input, send, and progress ability automatically once a needs-repair team is repaired, without requiring the user to act again.

#### Scenario: A deleted team is not sent to be repaired

- **GIVEN** a conversation whose bound team no longer exists
- **WHEN** the conversation renders
- **THEN** the stated recovery action is选择另一支团队
- **AND** no repair action is offered for the missing team.

## 新增行为规则

### Requirement: Four facts are the only visible run states

Source: docs/product/pages/main-conversation.md#区域与信息

- MUST render exactly four kinds of run facts as visible state: 一步没跑起来, 一步卡住了, 用户按了停, 反复重试仍未成功.
- MUST derive each from a persisted event kind supplied by the runtime, and MUST NOT infer it from record body text.
- MUST keep the four distinguishable from one another, and MUST keep them visible after a page refresh or application restart.
- MUST offer 重试 for 一步没跑起来 and 一步卡住了.
- MUST NOT offer 重试 for 用户按了停 or 反复重试仍未成功; for the latter MUST state that retrying has stopped and that the user may speak or hand the step to another member.
- MUST phrase these as steps not running, and MUST NOT phrase them as a member or the team failing.
- MUST present 用户按了停 as a neutral fact, and MUST NOT imply that changes already made can be undone.

#### Scenario: Facts survive a restart

- **GIVEN** a conversation contains all four kinds of facts
- **WHEN** the application is restarted and the conversation is opened
- **THEN** all four remain visible and distinguishable.

#### Scenario: Exhausted retries offer a way out, not another button

- **GIVEN** a step has failed repeatedly and retrying has stopped
- **WHEN** its record renders
- **THEN** no retry action is offered
- **AND** the record states that the user may speak or hand it to another member.

### Requirement: Machine text is filtered everywhere it renders

Source: docs/product/pages/main-conversation.md#指标与验收

- MUST apply machine-text filtering to every rendered conversation text, including agent message bodies, run step titles, run summaries, and system records.
- MUST NOT allow run directories, working directories, database paths, or internal ids to appear in conversation text.
- MUST NOT filter a folder path the user themselves selected when it is echoed back for confirmation in a repair dialog.

#### Scenario: An agent's absolute path does not reach the user

- **GIVEN** an agent's output contains an absolute filesystem path
- **WHEN** that message renders in the timeline
- **THEN** the path is not visible.

### Requirement: Three non-continuable states share one presentation

Source: docs/product/pages/main-conversation.md#页面状态

- MUST present 项目文件夹不可用, 团队已删除, and 团队需要修复 with the same treatment: history read-only, input and send disabled, and the corresponding context control marked as needing attention.
- MUST differ only in the explanatory wording and the recovery path.
- MUST NOT show a member as working once the underlying execution can no longer continue.

#### Scenario: The three look alike and recover differently

- **GIVEN** each of the three conditions in turn
- **WHEN** the conversation renders
- **THEN** history is read-only, input and send are disabled, and one context control is marked
- **AND** each states its own reason and recovery action.
