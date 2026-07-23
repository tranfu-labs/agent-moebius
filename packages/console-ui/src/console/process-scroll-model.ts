export type ProcessScrollMode = "initial" | "following" | "reading";

export interface ProcessScrollModel {
  mode: ProcessScrollMode;
  unreadCount: number;
}

export type ProcessScrollAction =
  | { type: "ready" }
  | { type: "scroll"; distanceFromBottom: number; threshold?: number }
  | { type: "append"; count: number }
  | { type: "return-latest" }
  | { type: "restore"; followLatest: boolean };

export const INITIAL_PROCESS_SCROLL_MODEL: ProcessScrollModel = {
  mode: "initial",
  unreadCount: 0,
};

export function reduceProcessScroll(
  state: ProcessScrollModel,
  action: ProcessScrollAction,
): ProcessScrollModel {
  switch (action.type) {
    case "ready":
      return state.mode === "initial"
        ? { mode: "following", unreadCount: 0 }
        : state;
    case "scroll": {
      const threshold = action.threshold ?? 48;
      if (action.distanceFromBottom <= threshold) {
        return { mode: "following", unreadCount: 0 };
      }
      return state.mode === "reading"
        ? state
        : { mode: "reading", unreadCount: state.unreadCount };
    }
    case "append":
      if (action.count <= 0 || state.mode !== "reading") {
        return state;
      }
      return { ...state, unreadCount: state.unreadCount + action.count };
    case "return-latest":
      return { mode: "following", unreadCount: 0 };
    case "restore":
      return {
        mode: action.followLatest ? "following" : "reading",
        unreadCount: 0,
      };
  }
}

export function processDistanceFromBottom(input: {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}): number {
  return Math.max(0, input.scrollHeight - input.scrollTop - input.clientHeight);
}
