import { describe, expect, it, vi } from "vitest";

import { interruptLocalConsoleRun } from "../src/console-page/interrupt.js";

describe("desktop console interrupt adapter", () => {
  it("posts the active run identity and refreshes after a successful stop", async () => {
    const fetch = vi.fn(async () => jsonResponse({ interrupted: true }, 202));
    const refresh = vi.fn(async () => undefined);

    await expect(interruptLocalConsoleRun({
      apiBase: "http://127.0.0.1:8787/",
      sessionId: "session/a",
      runId: "run-1",
      fetch,
      refresh,
    })).resolves.toBe("interrupted");

    expect(fetch).toHaveBeenCalledWith(
      new URL("http://127.0.0.1:8787/api/local-console/sessions/session%2Fa/interrupt"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ runId: "run-1" }),
      }),
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("treats a run that finished before the stop request as a refreshable race", async () => {
    const fetch = vi.fn(async () => jsonResponse({ interrupted: false, error: "No active run matched" }, 409));
    const refresh = vi.fn(async () => undefined);

    await expect(interruptLocalConsoleRun({
      apiBase: "http://127.0.0.1:8787/",
      sessionId: "session-a",
      runId: "run-finished",
      fetch,
      refresh,
    })).resolves.toBe("already-finished");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("still reports non-race interrupt failures", async () => {
    const refresh = vi.fn(async () => undefined);

    await expect(interruptLocalConsoleRun({
      apiBase: "http://127.0.0.1:8787/",
      sessionId: "session-a",
      runId: "run-1",
      fetch: vi.fn(async () => jsonResponse({ error: "server failed" }, 500)),
      refresh,
    })).rejects.toThrow("server failed");
    expect(refresh).not.toHaveBeenCalled();
  });
});

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
