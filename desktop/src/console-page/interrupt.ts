type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export async function interruptLocalConsoleRun(input: {
  apiBase: string;
  sessionId: string;
  runId: string;
  fetch: FetchLike;
  refresh: () => Promise<unknown>;
}): Promise<"interrupted" | "already-finished"> {
  const fetch = input.fetch;
  const response = await fetch(
    endpoint(input.apiBase, `/api/local-console/sessions/${encodeURIComponent(input.sessionId)}/interrupt`),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId: input.runId }),
    },
  );
  const body = await response.json() as { error?: string };
  if (!response.ok && response.status !== 409) {
    throw new Error(body.error ?? "interrupt failed");
  }
  await input.refresh();
  if (response.ok) {
    return "interrupted";
  }

  const stateUrl = endpoint(input.apiBase, "/api/local-console/state");
  stateUrl.searchParams.set("sessionId", input.sessionId);
  const stateResponse = await input.fetch(stateUrl);
  if (!stateResponse.ok) {
    throw new Error(body.error ?? "interrupt target could not be verified");
  }
  const state = await stateResponse.json() as {
    activeRuns?: Array<{ sessionId?: string; runId?: string }>;
    activeRun?: { sessionId?: string; runId?: string } | null;
  };
  const activeRuns = state.activeRuns
    ?? (state.activeRun === null || state.activeRun === undefined ? [] : [state.activeRun]);
  if (activeRuns.some((run) => run.sessionId === input.sessionId && run.runId === input.runId)) {
    throw new Error(body.error ?? "interrupt target is still active");
  }
  return "already-finished";
}

function endpoint(base: string, path: string): URL {
  return new URL(path.replace(/^\//u, ""), base.endsWith("/") ? base : `${base}/`);
}
