import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AGENT_MOEBIUS_DATA_ROOT_ENV,
  AGENT_MOEBIUS_WORKDIR_ROOT_ENV,
  resolveRuntimePaths,
} from "../src/config.js";

// 正例数据根刻意与 projectRoot（源码根）分叉，避免同值掩盖 workdir 逃逸。
const PROJECT_ROOT = "/opt/app/source";
const DATA_ROOT = "/home/user/.agent-moebius";

describe("resolveRuntimePaths workdir 派生", () => {
  it("未设环境变量时 workdir 派生自数据根（此处即 projectRoot），不落在源码目录旁", () => {
    const paths = resolveRuntimePaths({ env: {}, projectRoot: PROJECT_ROOT });

    expect(paths.dataRoot).toBe(PROJECT_ROOT);
    expect(paths.workdirRoot).toBe(path.join(PROJECT_ROOT, "workdir"));
    // 旧逃逸默认值：源码目录旁的兄弟目录，绝不能再出现。
    expect(paths.workdirRoot).not.toBe(path.resolve(PROJECT_ROOT, "..", "agent-moebius-workdir"));
  });

  it("设了数据根时 workdir 跟随数据根，而非源码根", () => {
    const paths = resolveRuntimePaths({
      env: { [AGENT_MOEBIUS_DATA_ROOT_ENV]: DATA_ROOT },
      projectRoot: PROJECT_ROOT,
    });

    expect(paths.dataRoot).toBe(DATA_ROOT);
    expect(paths.workdirRoot).toBe(path.join(DATA_ROOT, "workdir"));
    // 关键不变式：workdir 落在数据根内，且不在源码根内。
    expect(paths.workdirRoot.startsWith(DATA_ROOT)).toBe(true);
    expect(paths.workdirRoot.startsWith(PROJECT_ROOT)).toBe(false);
  });

  it("AGENT_MOEBIUS_WORKDIR_ROOT 作为显式覆盖优先于默认派生", () => {
    const override = "/mnt/fast-disk/moebius-worktrees";
    const paths = resolveRuntimePaths({
      env: {
        [AGENT_MOEBIUS_DATA_ROOT_ENV]: DATA_ROOT,
        [AGENT_MOEBIUS_WORKDIR_ROOT_ENV]: override,
      },
      projectRoot: PROJECT_ROOT,
    });

    expect(paths.workdirRoot).toBe(path.resolve(override));
  });

  it("空白的 workdir 覆盖被忽略，回退到数据根派生", () => {
    const paths = resolveRuntimePaths({
      env: {
        [AGENT_MOEBIUS_DATA_ROOT_ENV]: DATA_ROOT,
        [AGENT_MOEBIUS_WORKDIR_ROOT_ENV]: "   ",
      },
      projectRoot: PROJECT_ROOT,
    });

    expect(paths.workdirRoot).toBe(path.join(DATA_ROOT, "workdir"));
  });
});
