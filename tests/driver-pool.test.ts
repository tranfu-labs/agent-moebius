import { describe, expect, it } from "vitest";
import { createDriverPool } from "../src/driver-pool.js";

describe("driver pool", () => {
  it("starts all jobs immediately when no maxConcurrent limit is configured", async () => {
    const pool = createDriverPool();
    const release = deferred<void>();
    let running = 0;
    let maxRunning = 0;

    const jobs = [1, 2, 3].map((value) =>
      pool.run(async () => {
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        await release.promise;
        running -= 1;
        return value;
      }),
    );

    await delay(0);
    expect(maxRunning).toBe(3);

    release.resolve();
    await expect(Promise.all(jobs)).resolves.toEqual([1, 2, 3]);
  });

  it("limits running jobs when maxConcurrent is configured", async () => {
    const pool = createDriverPool({ maxConcurrent: 2 });
    const release = deferred<void>();
    let running = 0;
    let maxRunning = 0;

    const jobs = [1, 2, 3].map((value) =>
      pool.run(async () => {
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        await release.promise;
        running -= 1;
        return value;
      }),
    );

    await delay(0);
    expect(maxRunning).toBe(2);

    release.resolve();
    await expect(Promise.all(jobs)).resolves.toEqual([1, 2, 3]);
  });

  it("starts queued jobs after a rejected job releases capacity", async () => {
    const pool = createDriverPool({ maxConcurrent: 1 });
    const started: string[] = [];

    const failed = pool.run(async () => {
      started.push("failed");
      throw new Error("boom");
    });
    const succeeded = pool.run(async () => {
      started.push("succeeded");
      return "ok";
    });

    await expect(failed).rejects.toThrow("boom");
    await expect(succeeded).resolves.toBe("ok");
    expect(started).toEqual(["failed", "succeeded"]);
  });

  it("rejects invalid maxConcurrent values", () => {
    expect(() => createDriverPool({ maxConcurrent: 0 })).toThrow(/Invalid driver pool maxConcurrent/);
    expect(() => createDriverPool({ maxConcurrent: -1 })).toThrow(/Invalid driver pool maxConcurrent/);
    expect(() => createDriverPool({ maxConcurrent: 1.5 })).toThrow(/Invalid driver pool maxConcurrent/);
  });
});

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void; reject(error: unknown): void } {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
}
