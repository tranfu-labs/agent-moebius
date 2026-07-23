import { describe, expect, it } from "vitest";
import {
  INITIAL_PROCESS_SCROLL_MODEL,
  processDistanceFromBottom,
  reduceProcessScroll,
} from "./process-scroll-model";

describe("process scroll model", () => {
  it("starts at latest, follows near the bottom, and pauses after scrolling up", () => {
    const ready = reduceProcessScroll(INITIAL_PROCESS_SCROLL_MODEL, { type: "ready" });
    expect(ready).toEqual({ mode: "following", unreadCount: 0 });
    expect(reduceProcessScroll(ready, {
      type: "scroll",
      distanceFromBottom: 12,
    })).toEqual({ mode: "following", unreadCount: 0 });
    expect(reduceProcessScroll(ready, {
      type: "scroll",
      distanceFromBottom: 120,
    })).toEqual({ mode: "reading", unreadCount: 0 });
  });

  it("counts new events only while reading and resumes after returning to latest", () => {
    const reading = reduceProcessScroll(
      { mode: "reading", unreadCount: 0 },
      { type: "append", count: 3 },
    );
    expect(reading).toEqual({ mode: "reading", unreadCount: 3 });
    expect(reduceProcessScroll(reading, { type: "return-latest" })).toEqual({
      mode: "following",
      unreadCount: 0,
    });
    expect(reduceProcessScroll(
      { mode: "following", unreadCount: 0 },
      { type: "append", count: 2 },
    )).toEqual({ mode: "following", unreadCount: 0 });
  });

  it("restores independent follow state and clamps bottom distance", () => {
    expect(reduceProcessScroll(INITIAL_PROCESS_SCROLL_MODEL, {
      type: "restore",
      followLatest: false,
    })).toEqual({ mode: "reading", unreadCount: 0 });
    expect(processDistanceFromBottom({
      scrollHeight: 1_000,
      scrollTop: 820,
      clientHeight: 200,
    })).toBe(0);
  });
});
