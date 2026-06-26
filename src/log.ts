export type LogRecord = {
  event: string;
  [key: string]: unknown;
};

export function log(record: LogRecord): void {
  console.log(
    JSON.stringify({
      time: new Date().toISOString(),
      ...record,
    }),
  );
}
