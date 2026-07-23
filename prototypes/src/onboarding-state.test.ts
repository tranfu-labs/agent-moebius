import { describe, expect, it } from "vitest";

import {
  DEVELOPMENT_TEAM,
  canContinue,
  initialOnboardingState,
  onboardingReducer
} from "./onboarding-state.js";

describe("onboarding state", () => {
  it("blocks the first step while Codex is missing or checking", () => {
    const missing = initialOnboardingState("missing");
    const checking = initialOnboardingState("checking");

    expect(canContinue(missing)).toBe(false);
    expect(canContinue(checking)).toBe(false);
    expect(onboardingReducer(missing, { type: "continue" })).toBe(missing);
    expect(onboardingReducer(checking, { type: "continue" })).toBe(checking);
  });

  it("walks the happy path into a conversation with the selected team", () => {
    let state = initialOnboardingState();

    for (let index = 0; index < 4; index += 1) {
      state = onboardingReducer(state, { type: "continue" });
    }

    expect(state.view).toBe("conversation");
    expect(state.selectedTeam).toEqual(DEVELOPMENT_TEAM);
  });

  it("starts and replays the relay without changing the current step", () => {
    let state = initialOnboardingState();
    state = onboardingReducer(state, { type: "continue" });
    state = onboardingReducer(state, { type: "continue" });

    expect(state.view).toBe(3);
    expect(state.relayRun).toBe(1);

    state = onboardingReducer(state, { type: "replay-relay" });

    expect(state.view).toBe(3);
    expect(state.relayRun).toBe(2);
  });

  it("moves back without losing the selected team and replays relay on return", () => {
    let state = initialOnboardingState();
    state = onboardingReducer(state, { type: "continue" });

    state = onboardingReducer(state, { type: "back" });
    expect(state.view).toBe(1);
    expect(state.selectedTeam).toEqual(DEVELOPMENT_TEAM);

    state = onboardingReducer(state, { type: "continue" });
    state = onboardingReducer(state, { type: "continue" });
    state = onboardingReducer(state, { type: "continue" });
    const relayRunBeforeReturn = state.relayRun;

    state = onboardingReducer(state, { type: "back" });
    expect(state.view).toBe(3);
    expect(state.relayRun).toBe(relayRunBeforeReturn + 1);
    expect(state.selectedTeam).toEqual(DEVELOPMENT_TEAM);
  });

  it("does not move back from the first step or completed conversation", () => {
    const first = initialOnboardingState();
    expect(onboardingReducer(first, { type: "back" })).toBe(first);

    let completed = first;
    for (let index = 0; index < 4; index += 1) {
      completed = onboardingReducer(completed, { type: "continue" });
    }
    expect(onboardingReducer(completed, { type: "back" })).toBe(completed);
  });

  it("lets recheck restore the hard gate without resetting the journey", () => {
    let state = initialOnboardingState("missing");
    state = onboardingReducer(state, {
      type: "set-environment",
      value: "checking"
    });
    state = onboardingReducer(state, {
      type: "set-environment",
      value: "ready"
    });

    expect(canContinue(state)).toBe(true);
    expect(onboardingReducer(state, { type: "continue" }).view).toBe(2);
  });
});
