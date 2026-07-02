import type { GitHubResponseIntakeState } from "./github-response-intake.js";
import { log } from "./log.js";

export interface StatePersister {
  state(): GitHubResponseIntakeState;
  update(mutate: (state: GitHubResponseIntakeState) => GitHubResponseIntakeState): GitHubResponseIntakeState;
  flush(): Promise<void>;
}

export function createStatePersister(options: {
  initialState: GitHubResponseIntakeState;
  save: (state: GitHubResponseIntakeState) => Promise<void>;
}): StatePersister {
  let currentState = options.initialState;
  let dirty = false;
  let saving: Promise<void> | null = null;

  const startSaveLoop = (): void => {
    if (saving !== null) {
      return;
    }

    saving = (async () => {
      while (dirty) {
        dirty = false;
        const snapshot = currentState;
        try {
          await options.save(snapshot);
        } catch (error) {
          dirty = true;
          log({ event: "state-save-failed", error: formatError(error) });
          return;
        }
      }
    })().finally(() => {
      saving = null;
    });
  };

  return {
    state: () => currentState,
    update: (mutate) => {
      currentState = mutate(currentState);
      dirty = true;
      startSaveLoop();
      return currentState;
    },
    flush: async () => {
      while (saving !== null) {
        await saving;
      }
    },
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}
