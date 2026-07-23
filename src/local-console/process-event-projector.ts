export type LocalConsoleProcessEvent =
  | {
      key: string;
      kind: "agent-markdown";
      timestamp: string | null;
      markdown: string;
    }
  | {
      key: string;
      kind: "command";
      timestamp: string | null;
      phase: "started" | "completed";
      command: string;
      output: string | null;
      exitCode: number | null;
    }
  | {
      key: string;
      kind: "tool";
      timestamp: string | null;
      phase: "started" | "completed";
      name: string;
      input: string | null;
      output: string | null;
      status: string | null;
    }
  | {
      key: string;
      kind: "file";
      timestamp: string | null;
      action: string;
      path: string | null;
      detail: string | null;
    }
  | {
      key: string;
      kind: "error";
      timestamp: string | null;
      message: string;
      detail: string | null;
    }
  | {
      key: string;
      kind: "unsupported";
      timestamp: string | null;
      eventType: string;
    };

export interface ProjectCodexRolloutContext {
  runId: string;
  lineOffset: number;
}

const HIDDEN_TOP_LEVEL_TYPES = new Set([
  "compacted",
  "inter_agent_communication_metadata",
  "session_meta",
  "turn_context",
  "world_state",
]);

const HIDDEN_PAYLOAD_TYPES = new Set([
  "agent_reasoning",
  "context_compacted",
  "reasoning",
  "sub_agent_activity",
  "token_count",
  "task_started",
  "task_complete",
  "thread_settings_applied",
  "user_message",
]);

export function projectCodexRolloutRecord(
  value: unknown,
  context: ProjectCodexRolloutContext,
): LocalConsoleProcessEvent[] {
  const keyPrefix = `${context.runId}:rollout:${String(context.lineOffset)}`;
  if (!isRecord(value)) {
    return [unsupported(keyPrefix, null, "invalid-record")];
  }
  const timestamp = typeof value.timestamp === "string" ? value.timestamp : null;
  const topLevelType = typeof value.type === "string" ? value.type : "unknown";
  if (HIDDEN_TOP_LEVEL_TYPES.has(topLevelType)) {
    return [];
  }
  const payload = isRecord(value.payload) ? value.payload : null;
  const payloadType = payload !== null && typeof payload.type === "string" ? payload.type : null;
  if (payloadType !== null && HIDDEN_PAYLOAD_TYPES.has(payloadType)) {
    return [];
  }

  if (topLevelType === "event_msg" && payload !== null) {
    return projectEventMessage(payload, keyPrefix, timestamp);
  }
  if (topLevelType === "response_item" && payload !== null) {
    return projectResponseItem(payload, keyPrefix, timestamp);
  }
  return [unsupported(keyPrefix, timestamp, payloadType === null ? topLevelType : `${topLevelType}.${payloadType}`)];
}

export function malformedCodexRolloutEvent(
  runId: string,
  lineOffset: number,
  detail = "这一条 Codex 过程记录无法解析。",
): LocalConsoleProcessEvent {
  return {
    key: `${runId}:rollout:${String(lineOffset)}:malformed`,
    kind: "error",
    timestamp: null,
    message: "过程记录读取异常",
    detail,
  };
}

function projectEventMessage(
  payload: Record<string, unknown>,
  keyPrefix: string,
  timestamp: string | null,
): LocalConsoleProcessEvent[] {
  const type = typeof payload.type === "string" ? payload.type : "unknown";
  if (type === "agent_message") {
    const markdown = readText(payload.message);
    return markdown === null
      ? []
      : [{ key: agentMessageKey(keyPrefix, timestamp, markdown), kind: "agent-markdown", timestamp, markdown }];
  }
  if (type === "mcp_tool_call_end") {
    const invocation = isRecord(payload.invocation) ? payload.invocation : {};
    const server = typeof invocation.server === "string" ? invocation.server : "MCP";
    const tool = typeof invocation.tool === "string" ? invocation.tool : "工具";
    return [{
      key: `${keyPrefix}:mcp`,
      kind: "tool",
      timestamp,
      phase: "completed",
      name: `${server} · ${tool}`,
      input: displayValue(invocation.arguments),
      output: displayToolOutput(payload.result),
      status: readStatus(payload.result),
    }];
  }
  if (type === "patch_apply_end") {
    const changes = isRecord(payload.changes) ? Object.entries(payload.changes) : [];
    if (changes.length > 0) {
      return changes.map(([filePath, change], index) => ({
        key: `${keyPrefix}:patch:${String(index)}`,
        kind: "file",
        timestamp,
        action: fileAction(change),
        path: safeDisplayPath(filePath),
        detail: null,
      }));
    }
    if (payload.success === false) {
      return [{
        key: `${keyPrefix}:patch-error`,
        kind: "error",
        timestamp,
        message: "文件修改失败",
        detail: readText(payload.stderr) ?? readText(payload.stdout),
      }];
    }
    return [{
      key: `${keyPrefix}:patch`,
      kind: "file",
      timestamp,
      action: "应用文件修改",
      path: null,
      detail: readText(payload.stdout),
    }];
  }
  if (type === "web_search_end") {
    return [{
      key: `${keyPrefix}:web-search`,
      kind: "tool",
      timestamp,
      phase: "completed",
      name: "网页搜索",
      input: readText(payload.query),
      output: displaySearchResults(payload.results),
      status: "completed",
    }];
  }
  if (type === "turn_aborted") {
    return [{
      key: `${keyPrefix}:turn-aborted`,
      kind: "error",
      timestamp,
      message: "本轮执行已中止",
      detail: readText(payload.reason),
    }];
  }
  if (type === "thread_rolled_back") {
    return [{
      key: `${keyPrefix}:thread-rolled-back`,
      kind: "error",
      timestamp,
      message: "Codex 已回退会话",
      detail: typeof payload.num_turns === "number"
        ? `回退 ${String(payload.num_turns)} 轮`
        : null,
    }];
  }
  if (type.includes("error") || type === "stream_failure") {
    return [{
      key: `${keyPrefix}:error`,
      kind: "error",
      timestamp,
      message: readText(payload.message) ?? readText(payload.error) ?? "Codex 执行异常",
      detail: readText(payload.details),
    }];
  }
  return [unsupported(`${keyPrefix}:event`, timestamp, `event_msg.${type}`)];
}

function projectResponseItem(
  payload: Record<string, unknown>,
  keyPrefix: string,
  timestamp: string | null,
): LocalConsoleProcessEvent[] {
  const type = typeof payload.type === "string" ? payload.type : "unknown";
  if (type === "reasoning") {
    return [];
  }
  if (type === "message" || type === "agent_message") {
    if (type === "message" && payload.role !== "assistant") {
      return [];
    }
    const markdown = readContentText(payload.content);
    return markdown === null
      ? []
      : [{ key: agentMessageKey(keyPrefix, timestamp, markdown), kind: "agent-markdown", timestamp, markdown }];
  }
  if (type === "function_call") {
    return [toolEvent(payload, `${keyPrefix}:function`, timestamp, "started")];
  }
  if (type === "function_call_output") {
    return [toolEvent(payload, `${keyPrefix}:function-output`, timestamp, "completed")];
  }
  if (type === "custom_tool_call" || type === "tool_search_call") {
    const name = typeof payload.name === "string"
      ? payload.name
      : type === "tool_search_call"
        ? "搜索可用工具"
        : "工具调用";
    if (name === "exec_command" || name === "shell" || name === "command") {
      return [{
        key: `${keyPrefix}:command`,
        kind: "command",
        timestamp,
        phase: "started",
        command: readText(payload.input) ?? readText(payload.arguments) ?? name,
        output: null,
        exitCode: null,
      }];
    }
    return [{
      key: `${keyPrefix}:custom`,
      kind: "tool",
      timestamp,
      phase: "started",
      name,
      input: readText(payload.input) ?? displayValue(payload.arguments),
      output: null,
      status: typeof payload.status === "string" ? payload.status : null,
    }];
  }
  if (type === "custom_tool_call_output" || type === "tool_search_output") {
    return [{
      key: `${keyPrefix}:custom-output`,
      kind: "tool",
      timestamp,
      phase: "completed",
      name: type === "tool_search_output" ? "搜索可用工具" : "工具调用",
      input: null,
      output: displayToolOutput(payload.output) ?? displayToolOutput(payload.tools),
      status: typeof payload.status === "string" ? payload.status : null,
    }];
  }
  if (type === "command_execution") {
    const phase = payload.status === "completed" ? "completed" : "started";
    return [{
      key: `${keyPrefix}:command`,
      kind: "command",
      timestamp,
      phase,
      command: readText(payload.command) ?? readText(payload.text) ?? "运行命令",
      output: readText(payload.output),
      exitCode: typeof payload.exit_code === "number" ? payload.exit_code : null,
    }];
  }
  return [unsupported(`${keyPrefix}:response`, timestamp, `response_item.${type}`)];
}

function toolEvent(
  payload: Record<string, unknown>,
  key: string,
  timestamp: string | null,
  phase: "started" | "completed",
): LocalConsoleProcessEvent {
  return {
    key,
    kind: "tool",
    timestamp,
    phase,
    name: typeof payload.name === "string" ? payload.name : "函数调用",
    input: phase === "started" ? readText(payload.arguments) : null,
    output: phase === "completed" ? displayValue(payload.output) : null,
    status: typeof payload.status === "string" ? payload.status : null,
  };
}

function unsupported(
  key: string,
  timestamp: string | null,
  eventType: string,
): LocalConsoleProcessEvent {
  return { key, kind: "unsupported", timestamp, eventType };
}

function readContentText(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return readText(value);
  }
  const parts = value.flatMap((part): string[] => {
    if (!isRecord(part)) {
      return [];
    }
    const type = typeof part.type === "string" ? part.type : "";
    if (type !== "output_text" && type !== "text") {
      return [];
    }
    const text = readText(part.text);
    return text === null ? [] : [text];
  });
  return parts.length === 0 ? null : parts.join("");
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function displayValue(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function displayToolOutput(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    const parts = value.flatMap((part): string[] => {
      if (!isRecord(part)) {
        return [];
      }
      const text = readText(part.text);
      if (text !== null) {
        return [text];
      }
      return typeof part.image_url === "string" ? ["[图片结果]"] : [];
    });
    return parts.length > 0 ? parts.join("\n") : null;
  }
  if (isRecord(value)) {
    if ("Ok" in value) {
      return displayToolOutput(value.Ok);
    }
    if ("Err" in value) {
      return displayToolOutput(value.Err) ?? "工具执行失败";
    }
    if (Array.isArray(value.content)) {
      return displayToolOutput(value.content);
    }
    if (typeof value.message === "string") {
      return value.message;
    }
  }
  return null;
}

function displaySearchResults(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const results = value.flatMap((entry): string[] => {
    if (!isRecord(entry)) {
      return [];
    }
    const title = readText(entry.title);
    const url = readText(entry.url);
    return title === null && url === null
      ? []
      : [`${title ?? "搜索结果"}${url === null ? "" : `\n${url}`}`];
  });
  return results.length > 0 ? results.join("\n\n") : null;
}

function fileAction(value: unknown): string {
  if (!isRecord(value) || typeof value.type !== "string") {
    return "修改文件";
  }
  const labels: Record<string, string> = {
    add: "新增文件",
    create: "新增文件",
    delete: "删除文件",
    move: "移动文件",
    update: "修改文件",
  };
  return labels[value.type.toLowerCase()] ?? "修改文件";
}

function safeDisplayPath(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  if (!normalized.startsWith("/") && !/^[A-Za-z]:\//u.test(normalized) && !normalized.startsWith("../")) {
    return normalized;
  }
  return normalized.split("/").filter(Boolean).at(-1) ?? "文件";
}

function readStatus(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }
  return typeof value.status === "string"
    ? value.status
    : "Ok" in value
      ? "completed"
      : "Err" in value
        ? "failed"
        : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function agentMessageKey(
  keyPrefix: string,
  timestamp: string | null,
  markdown: string,
): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < markdown.length; index += 1) {
    hash ^= markdown.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  const timestampMs = timestamp === null ? Number.NaN : Date.parse(timestamp);
  const timeBucket = Number.isFinite(timestampMs)
    ? String(Math.floor(timestampMs / 1_000))
    : keyPrefix;
  return `agent:${timeBucket}:${(hash >>> 0).toString(16)}`;
}
