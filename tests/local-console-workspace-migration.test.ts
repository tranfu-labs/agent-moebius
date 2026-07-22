import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { createSqliteLocalConsoleStore } from "../src/local-console/store.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("session workspace migration", () => {
  it("inherits the owning project mode, is idempotent, and tolerates orphan sessions", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "moebius-workspace-migration-"));
    roots.push(root);
    const sqlitePath = path.join(root, "local-console.sqlite");
    createLegacyDatabase(sqlitePath);

    for (let pass = 0; pass < 2; pass += 1) {
      const store = await createSqliteLocalConsoleStore({ sqlitePath });
      await store.init();
      await store.close();
    }

    const database = new DatabaseSync(sqlitePath);
    try {
      const rows = database.prepare(
        `SELECT session_id, workspace_mode, workspace_pending_mode
         FROM sessions
         WHERE session_id IN ('direct-session', 'worktree-session', 'orphan-session')
         ORDER BY session_id`,
      ).all();
      expect(rows).toEqual([
        { session_id: "direct-session", workspace_mode: "direct", workspace_pending_mode: null },
        { session_id: "orphan-session", workspace_mode: "direct", workspace_pending_mode: null },
        { session_id: "worktree-session", workspace_mode: "worktree", workspace_pending_mode: null },
      ]);
    } finally {
      database.close();
    }
  });
});

function createLegacyDatabase(sqlitePath: string): void {
  const database = new DatabaseSync(sqlitePath);
  try {
    database.exec(`
      CREATE TABLE projects (
        project_id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL,
        title TEXT NOT NULL,
        folder_path TEXT NOT NULL UNIQUE,
        worktree_mode INTEGER NOT NULL DEFAULT 0,
        workspace_cwd TEXT,
        workspace_mode TEXT,
        worktree_path TEXT,
        worktree_unavailable_reason TEXT,
        workspace_updated_at TEXT,
        original_folder_path TEXT,
        removed_at TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE sessions (
        session_id TEXT PRIMARY KEY,
        project_id TEXT,
        source_type TEXT NOT NULL,
        source_owner TEXT,
        source_repo TEXT,
        source_issue_number INTEGER,
        parent_session_id TEXT,
        agent_team_ownership TEXT,
        agent_team_id TEXT,
        title TEXT,
        status TEXT NOT NULL,
        archived_at TEXT,
        awaits_human_reason TEXT,
        unread_since TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO projects VALUES
        ('direct-project', 'local-folder', 'direct', '/tmp/direct', 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, '2026-07-01', '2026-07-01'),
        ('worktree-project', 'local-folder', 'worktree', '/tmp/worktree', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1, '2026-07-01', '2026-07-01');
      INSERT INTO sessions
        (session_id, project_id, source_type, title, status, created_at, updated_at)
      VALUES
        ('direct-session', 'direct-project', 'local', 'direct', 'active', '2026-07-01', '2026-07-01'),
        ('worktree-session', 'worktree-project', 'local', 'worktree', 'active', '2026-07-01', '2026-07-01'),
        ('orphan-session', 'removed-project', 'local', 'orphan', 'active', '2026-07-01', '2026-07-01');
    `);
  } finally {
    database.close();
  }
}
