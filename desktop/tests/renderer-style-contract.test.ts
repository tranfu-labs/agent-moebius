import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertCompiledRendererStyles } from "../scripts/renderer-style-contract.mjs";

const compiledCss = ".flex{display:flex}.grid{display:grid}.bg-canvas{background:var(--canvas)}.text-ink{color:var(--ink)}";
const here = dirname(fileURLToPath(import.meta.url));

describe("renderer style build contract", () => {
  it("accepts compiled console-ui styles", () => {
    expect(() => assertCompiledRendererStyles(compiledCss)).not.toThrow();
  });

  it.each(["@tailwind utilities;", "button{@apply inline-flex}"])(
    "rejects an uncompiled build directive in %s",
    (directive) => {
      expect(() => assertCompiledRendererStyles(`${compiledCss}${directive}`)).toThrow(/uncompiled directives/u);
    },
  );

  it("rejects a stylesheet without representative console-ui utilities", () => {
    expect(() => assertCompiledRendererStyles(".flex{display:flex}")).toThrow(
      /\.grid, \.bg-canvas, \.text-ink/u,
    );
  });

  it("does not confuse prefixed selectors with the required utility", () => {
    expect(() => assertCompiledRendererStyles(`${compiledCss.replace(".grid{", ".grid-cols-2{")}`)).toThrow(/\.grid/u);
  });

  it("keeps desktop console CSS limited to renderer host elements", () => {
    const hostCss = readFileSync(resolve(here, "../src/console-page/console.css"), "utf8");

    expect(hostCss).toMatch(/html,[\s\S]*body,[\s\S]*#root/u);
    expect(hostCss).not.toMatch(/button|textarea|aside|main|section|footer|form|article|\[class/u);
  });
});
