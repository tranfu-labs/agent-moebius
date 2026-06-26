import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { read, write } from "../src/state.js";

describe("state", () => {
  let tempDir: string;
  let stateFile: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-state-"));
    stateFile = path.join(tempDir, "state.json");
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("defaults to zero when the state file is missing", async () => {
    await expect(read(stateFile)).resolves.toEqual({ maxRespondedCount: 0 });
  });

  it("writes and reads state", async () => {
    await write({ maxRespondedCount: 3 }, stateFile);

    await expect(read(stateFile)).resolves.toEqual({ maxRespondedCount: 3 });
  });

  it("leaves parseable JSON after concurrent writes", async () => {
    await Promise.all([
      write({ maxRespondedCount: 1 }, stateFile),
      write({ maxRespondedCount: 2 }, stateFile),
      write({ maxRespondedCount: 3 }, stateFile),
    ]);

    const raw = await fs.readFile(stateFile, "utf8");
    const parsed = JSON.parse(raw) as { maxRespondedCount: number };

    expect([1, 2, 3]).toContain(parsed.maxRespondedCount);
  });
});
