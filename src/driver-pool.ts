export interface DriverPool {
  run<T>(job: () => Promise<T>): Promise<T>;
}

export function createDriverPool(options: { maxConcurrent?: number | null } = {}): DriverPool {
  if (options.maxConcurrent === undefined || options.maxConcurrent === null) {
    return { run: runImmediately };
  }

  if (!Number.isInteger(options.maxConcurrent) || options.maxConcurrent <= 0) {
    throw new Error(`Invalid driver pool maxConcurrent: ${String(options.maxConcurrent)}`);
  }

  return new QueuedDriverPool(options.maxConcurrent);
}

function runImmediately<T>(job: () => Promise<T>): Promise<T> {
  try {
    return Promise.resolve(job());
  } catch (error) {
    return Promise.reject(error);
  }
}

interface QueuedJob<T> {
  job: () => Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

class QueuedDriverPool implements DriverPool {
  private readonly queue: Array<QueuedJob<unknown>> = [];
  private running = 0;

  constructor(private readonly maxConcurrent: number) {}

  run<T>(job: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ job, resolve: resolve as (value: unknown) => void, reject });
      this.pump();
    });
  }

  private pump(): void {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      const next = this.queue.shift();
      if (next === undefined) {
        return;
      }

      this.running += 1;
      void runImmediately(next.job)
        .then(next.resolve, next.reject)
        .finally(() => {
          this.running -= 1;
          this.pump();
        });
    }
  }
}
