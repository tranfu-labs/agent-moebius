import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cloneManagedMessageAttachments,
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

  it("clones message attachments into the session draft through the capability endpoint", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      attachments: [{
        attachmentId: "clone-1",
        kind: "file",
        displayName: "brief.txt",
        mediaType: "text/plain",
        byteSize: 5,
      }],
    }), {
      status: 201,
      headers: { "content-type": "application/json" },
    }));

    await expect(cloneManagedMessageAttachments({
      apiBase: "http://127.0.0.1:8788/",
      capability: "test-capability",
      fetch,
      sessionId: "session-a",
      sourceMessageId: 41,
      targetDraftKey: "draft:session-a",
    })).resolves.toMatchObject([{ attachmentId: "clone-1" }]);

    expect(fetch).toHaveBeenCalledWith(
      new URL("http://127.0.0.1:8788/api/local-console/attachments/clone"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-moebius-attachment-capability": "test-capability",
        }),
        body: JSON.stringify({
          sessionId: "session-a",
          sourceMessageId: 41,
          targetDraftKey: "draft:session-a",
        }),
      }),
    );
  });
});
