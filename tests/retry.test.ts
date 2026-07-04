import { describe, expect, it, vi } from "vitest";
import { classifyGhError, withRetry } from "../src/retry.js";

const noopSleep = async () => {};

describe("classifyGhError", () => {
  it("classifies GitHub network blips as transient", () => {
    expect(classifyGhError({ stderr: 'Post "https://api.github.com/graphql": EOF' })).toBe("transient");
    expect(classifyGhError(new Error("read tcp: connection reset by peer (ECONNRESET)"))).toBe("transient");
    expect(classifyGhError({ stderr: "HTTP 502: Bad Gateway" })).toBe("transient");
    expect(classifyGhError({ stderr: "You have exceeded a secondary rate limit" })).toBe("transient");
    expect(classifyGhError(new Error("gh failed with unknown exit: timed out after 120000ms"))).toBe("transient");
  });

  it("classifies client-side and auth failures as deterministic", () => {
    expect(
      classifyGhError({
        stderr: "GraphQL: Could not resolve to an issue or pull request with the number of 4. (repository.issue)",
      }),
    ).toBe("deterministic");
    expect(classifyGhError({ stderr: "HTTP 401: Bad credentials" })).toBe("deterministic");
    expect(classifyGhError(new Error("spawn gh ENOENT"))).toBe("deterministic");
  });

  it("defaults unknown gh runtime failures to transient", () => {
    expect(classifyGhError({ stderr: "something weird happened" })).toBe("transient");
  });
});

describe("withRetry", () => {
  it("retries transient failures and eventually succeeds", async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("EOF");
      }
      return "ok";
    });

    const result = await withRetry(fn, {
      label: "test",
      shouldRetry: (error) => classifyGhError(error) === "transient",
      sleep: noopSleep,
    });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry deterministic errors", async () => {
    const fn = vi.fn(async () => {
      throw new Error("HTTP 401: Bad credentials");
    });

    await expect(
      withRetry(fn, {
        label: "test",
        shouldRetry: (error) => classifyGhError(error) === "transient",
        sleep: noopSleep,
      }),
    ).rejects.toThrow("Bad credentials");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("rethrows the original error after retries are exhausted", async () => {
    const fn = vi.fn(async () => {
      throw new Error("EOF");
    });

    await expect(
      withRetry(fn, { label: "test", retries: 2, shouldRetry: () => true, sleep: noopSleep }),
    ).rejects.toThrow("EOF");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("stops retrying once the abort signal fires", async () => {
    const controller = new AbortController();
    const fn = vi.fn(async () => {
      controller.abort();
      throw new Error("EOF");
    });

    await expect(
      withRetry(fn, { label: "test", retries: 5, signal: controller.signal, shouldRetry: () => true, sleep: noopSleep }),
    ).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
