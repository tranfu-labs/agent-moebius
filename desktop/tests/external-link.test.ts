import { describe, expect, it, vi } from "vitest";

import {
  installExternalNavigationGuards,
  isApplicationNavigation,
  openValidatedExternalLink,
  validateExternalLink,
} from "../src/external-link.js";

describe("desktop Markdown external links", () => {
  it("accepts only absolute http, https, and mailto URLs", () => {
    expect(validateExternalLink("https://example.com/a?q=1")).toBe("https://example.com/a?q=1");
    expect(validateExternalLink("http://example.com")).toBe("http://example.com/");
    expect(validateExternalLink("mailto:user@example.com")).toBe("mailto:user@example.com");
    for (const value of ["/relative", "file:///tmp/a", "data:text/html,x", "javascript:alert(1)", "slack://x", 42]) {
      expect(validateExternalLink(value)).toBeNull();
    }
  });

  it("opens validated URLs once and rejects blocked values", async () => {
    const shell = { openExternal: vi.fn(async () => undefined) };

    await openValidatedExternalLink("https://example.com/docs", shell);
    await expect(openValidatedExternalLink("file:///tmp/secret", shell)).rejects.toThrow(/absolute http/u);

    expect(shell.openExternal).toHaveBeenCalledTimes(1);
    expect(shell.openExternal).toHaveBeenCalledWith("https://example.com/docs");
  });

  it("denies new windows and top-level navigation outside the loaded application file", () => {
    let openHandler = (): { action: "deny" } => ({ action: "deny" });
    let navigationHandler = (_event: { preventDefault(): void }, _url: string): void => undefined;
    const webContents = {
      setWindowOpenHandler(handler: () => { action: "deny" }) {
        openHandler = handler;
      },
      on(_event: "will-navigate", listener: (event: { preventDefault(): void }, url: string) => void) {
        navigationHandler = listener;
      },
    };
    const applicationUrl = "file:///app/console-page/index.html";
    installExternalNavigationGuards(webContents, applicationUrl);

    expect(openHandler()).toEqual({ action: "deny" });
    expect(isApplicationNavigation(`${applicationUrl}#footnote`, applicationUrl)).toBe(true);
    expect(isApplicationNavigation("https://example.com", applicationUrl)).toBe(false);

    const externalEvent = { preventDefault: vi.fn() };
    navigationHandler(externalEvent, "https://example.com");
    expect(externalEvent.preventDefault).toHaveBeenCalledOnce();

    const internalEvent = { preventDefault: vi.fn() };
    navigationHandler(internalEvent, `${applicationUrl}#footnote`);
    expect(internalEvent.preventDefault).not.toHaveBeenCalled();
  });
});
