export const OPEN_EXTERNAL_LINK_IPC_CHANNEL = "markdown:open-external-link";

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export function validateExternalLink(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  try {
    const url = new URL(value);
    return ALLOWED_EXTERNAL_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export async function openValidatedExternalLink(
  value: unknown,
  shell: { openExternal(url: string): Promise<void> },
): Promise<void> {
  const url = validateExternalLink(value);
  if (url === null) {
    throw new Error("external link must be an absolute http, https, or mailto URL");
  }
  await shell.openExternal(url);
}

export interface GuardedWebContents {
  setWindowOpenHandler(handler: () => { action: "deny" }): void;
  on(event: "will-navigate", listener: (event: { preventDefault(): void }, url: string) => void): void;
}

export function installExternalNavigationGuards(
  webContents: GuardedWebContents,
  applicationUrl: string,
): void {
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  webContents.on("will-navigate", (event, targetUrl) => {
    if (!isApplicationNavigation(targetUrl, applicationUrl)) {
      event.preventDefault();
    }
  });
}

export function isApplicationNavigation(targetUrl: string, applicationUrl: string): boolean {
  try {
    const target = new URL(targetUrl);
    const application = new URL(applicationUrl);
    return target.protocol === "file:"
      && application.protocol === "file:"
      && target.pathname === application.pathname
      && target.search === application.search;
  } catch {
    return false;
  }
}
