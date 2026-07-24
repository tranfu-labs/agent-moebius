# Desktop Status Page Wireframe

Desktop status is an auxiliary diagnostic window reachable from the operator console. It is a read-only status surface with three actions: open observer, open data directory, and check updates. It does not provide configuration editing or runner control buttons.

Normal state:

```text
┌──────────────────────────────────────────────┐
│  moebius                       v0.1.0  │
├──────────────────────────────────────────────┤
│  运行状态                                     │
│   ● runner    运行中                          │
│   ● observer  127.0.0.1:52341   [打开观察页]  │
│                                              │
│  环境自检                                      │
│   ✓ codex CLI   已找到                        │
│   ✓ gh CLI      已登录 (aquarius-wing)        │
│   ⚠ 仓库白名单   未配置        [打开数据目录]   │
│                                              │
├──────────────────────────────────────────────┤
│  当前版本 0.1.0                    [检查更新]  │
└──────────────────────────────────────────────┘
```

Runner restarting:

```text
│   ◐ runner    已崩溃，第 2/3 次重启中…         │
```

Runner stopped after repeated crashes:

```text
│   ✗ runner    已停止（连续崩溃 3 次）           │
│               日志：~/.moebius/logs/…   │
```

Doctor failures:

```text
│   ✗ codex CLI   未找到，请安装后重启应用        │
│   ✗ gh CLI      未登录，请运行 gh auth login   │
```
