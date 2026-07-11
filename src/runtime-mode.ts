export const GITHUB_MODE_FLAG = "--github-mode";

export type RuntimeMode = "local" | "github";

export function resolveRuntimeMode(argv: readonly string[]): RuntimeMode {
  const runtimeArgs = argv[0] === "--" ? argv.slice(1) : argv;
  if (runtimeArgs.length === 0) {
    return "local";
  }
  if (runtimeArgs.length === 1 && runtimeArgs[0] === GITHUB_MODE_FLAG) {
    return "github";
  }

  throw new Error(`Unknown startup arguments: ${runtimeArgs.join(" ")}`);
}
