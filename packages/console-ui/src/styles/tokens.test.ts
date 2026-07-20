import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const tokens = readFileSync(resolve(here, "tokens.css"), "utf8");
const globals = readFileSync(resolve(here, "globals.css"), "utf8");

describe("near-monochrome tokens", () => {
  it("maps shadcn semantic variables onto console tokens", () => {
    expect(globals).toContain("--background: var(--canvas)");
    expect(globals).toContain("--foreground: var(--ink)");
    expect(globals).toContain("--primary: var(--accent)");
    expect(globals).toContain("--border: var(--line)");
    expect(globals).toContain("--muted: var(--sunken)");
    expect(globals).toContain("--destructive: var(--danger)");
    expect(globals).toContain("--ring: var(--accent)");
  });

  it("keeps waiting states hue-free and danger on Linear red", () => {
    expect(tokens).toContain("--danger: #E5484D");
    expect(tokens).not.toMatch(/amber|soft/i);
  });

  it("uses indigo as the single interaction accent in both themes", () => {
    expect(tokens.match(/--accent: #5E6AD2/g)?.length).toBe(3);
    expect(tokens).toContain("--accent-hover: #4B57C8");
    expect(tokens).toContain("--accent-hover: #828FFF");
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
    expect(globals).toContain("--radius: 6px");
    expect(globals).toContain("box-shadow: var(--ring-focus)");
  });
});
