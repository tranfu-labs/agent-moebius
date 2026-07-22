type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export async function interruptLocalConsoleRun(input: {
  apiBase: string;
  sessionId: string;
  runId: string;
  fetch: FetchLike;
  refresh: () => Promise<unknown>;
}): Promise<"interrupted" | "already-finished"> {
  const response = await input.fetch(
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
  return response.ok ? "interrupted" : "already-finished";
}

function endpoint(base: string, path: string): URL {
  return new URL(path.replace(/^\//u, ""), base.endsWith("/") ? base : `${base}/`);
}
