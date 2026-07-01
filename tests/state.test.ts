import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getRoleThreadState,
  loadRoleThreadStateStore,
  saveRoleThreadStateEntry,
  saveRoleThreadStateStore,
  withRoleThreadState,
} from "../src/state.js";

describe("role thread state store", () => {
  it("returns an empty store when the state file does not exist", async () => {
    const filePath = path.join(await makeTempDir(), "missing", "role-threads.json");

    await expect(loadRoleThreadStateStore(filePath)).resolves.toEqual({});
  });

  it("saves and loads role thread state", async () => {
    const filePath = path.join(await makeTempDir(), ".state", "role-threads.json");
    const store = withRoleThreadState({}, "tranfu-labs/agent-moebius#3", "product-manager", {
      threadId: "thread-1",
      lastSeenIndex: 4,
    });

    await saveRoleThreadStateStore(store, filePath);

    await expect(loadRoleThreadStateStore(filePath)).resolves.toEqual(store);
    expect(getRoleThreadState(store, "tranfu-labs/agent-moebius#3", "product-manager")).toEqual({
      threadId: "thread-1",
      lastSeenIndex: 4,
    });
    expect(getRoleThreadState(store, "tranfu-labs/agent-moebius#3", "hermes-user")).toBeNull();
  });

  it("fails safely on invalid state shape", async () => {
    const filePath = path.join(await makeTempDir(), ".state", "role-threads.json");
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify({ issue: { role: { threadId: "", lastSeenIndex: -1 } } }), "utf8");

    await expect(loadRoleThreadStateStore(filePath)).rejects.toThrow(/Invalid role thread state file/);
  });

  it("merges concurrent entry saves without overwriting other roles", async () => {
    const filePath = path.join(await makeTempDir(), ".state", "role-threads.json");

    await Promise.all([
      saveRoleThreadStateEntry(
        "tranfu-labs/agent-moebius#3",
        "dev",
        { threadId: "thread-dev", lastSeenIndex: 2 },
        filePath,
      ),
      saveRoleThreadStateEntry(
        "tranfu-labs/agent-moebius#4",
        "product-manager",
        { threadId: "thread-pm", lastSeenIndex: 5 },
        filePath,
      ),
    ]);

    await expect(loadRoleThreadStateStore(filePath)).resolves.toEqual({
      "tranfu-labs/agent-moebius#3": {
        dev: { threadId: "thread-dev", lastSeenIndex: 2 },
      },
      "tranfu-labs/agent-moebius#4": {
        "product-manager": { threadId: "thread-pm", lastSeenIndex: 5 },
      },
    });
  });
});

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-state-test-"));
}
