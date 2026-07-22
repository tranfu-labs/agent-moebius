import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const tokens = readFileSync(resolve(here, "tokens.css"), "utf8");
const globals = readFileSync(resolve(here, "globals.css"), "utf8");

describe("dashboard tokens", () => {
  it("defines one shared window header height for native-control alignment", () => {
    expect(tokens.match(/--window-header-height: 46px/g)?.length).toBe(1);
  });

  it("maps shadcn semantic variables onto console tokens", () => {
    expect(globals).toContain("--background: var(--canvas)");
    expect(globals).toContain("--foreground: var(--ink)");
    expect(globals).toContain("--primary: var(--accent)");
    expect(globals).toContain("--border: var(--line)");
    expect(globals).toContain("--muted: var(--sunken)");
    expect(globals).toContain("--destructive: var(--danger)");
    expect(globals).toContain("--ring: var(--accent)");
  });

  it("uses indigo as the single interaction accent in both themes", () => {
    expect(tokens.match(/--accent: #5E6AD2/g)?.length).toBe(3);
    expect(tokens).toContain("--accent-hover: #4B57C8");
    expect(tokens).toContain("--accent-hover: #828FFF");
  });

  it("defines the status hue family for both light and dark themes", () => {
    for (const token of [
      "--status-run-fg",
      "--status-run-bg",
      "--status-run-line",
      "--status-info-fg",
      "--status-info-bg",
      "--status-info-line",
      "--status-violet-fg",
      "--status-violet-bg",
      "--status-violet-line",
      "--status-neutral-fg",
      "--status-neutral-bg",
      "--status-neutral-line",
      "--status-pass-bg",
      "--status-pass-line",
      "--status-danger-bg",
      "--status-danger-line"
    ]) {
      expect(tokens.match(new RegExp(`${token}:`, "g"))?.length).toBe(3);
    }
  });

  it("sets the near-black dark canvas and the 14px radius baseline", () => {
    expect(tokens.match(/--canvas: #0A0B0D/g)?.length).toBe(2);
    expect(tokens.match(/--card: #15161A/g)?.length).toBe(2);
    expect(globals).toContain("--radius: 14px");
  });

  it("defines popover shadow, double-layer focus ring, and motion tokens", () => {
    expect(tokens).toContain("--shadow-pop:");
    expect(tokens).toContain("inset 0 0 0 1px rgba(255, 255, 255, 0.08)");
    expect(tokens).toContain("--ring-focus:");
    expect(tokens).toContain("--dur: 150ms");
    expect(tokens).toContain("--ease: cubic-bezier(0.25, 0.46, 0.45, 0.94)");
    expect(tokens).toContain("--ease-enter: cubic-bezier(0.165, 0.84, 0.44, 1)");
  });

  it("self-hosts Inter Variable and applies cv01/ss03 globally", () => {
    expect(globals).toContain('font-family: "InterVar"');
    expect(globals).toContain("./fonts/inter-var-latin-cv01.woff2");
    expect(globals).toContain('font-feature-settings: "cv01", "ss03"');
    expect(globals).toContain("box-shadow: var(--ring-focus)");
  });
});
