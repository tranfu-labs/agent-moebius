import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listManagedDraftAttachments,
  managedAttachmentFetch,
} from "../src/console-page/attachment-client.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("managed attachment client", () => {
  it("invokes browser fetch with its global receiver", async () => {
    const receiverAwareFetch = vi.fn(function (this: unknown) {
      if (this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      return Promise.resolve(new Response(JSON.stringify({ attachments: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    });
    globalThis.fetch = receiverAwareFetch as typeof fetch;

    await expect(listManagedDraftAttachments({
      apiBase: "http://127.0.0.1:8788/",
      capability: "test-capability",
      draftKey: "draft:new",
      fetch: managedAttachmentFetch,
    })).resolves.toEqual([]);
    expect(receiverAwareFetch).toHaveBeenCalledOnce();
  });
});
