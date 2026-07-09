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
});
