import { describe, expect, it } from "vitest";

import { assertStaticNodeBundle } from "../scripts/node-bundle-contract.mjs";

describe("desktop Node bundle contract", () => {
  it("accepts a native ESM bundle", () => {
    expect(() => assertStaticNodeBundle("import process from 'node:process';", "main.js")).not.toThrow();
  });

  it("rejects esbuild's runtime dynamic require shim", () => {
    const bundle = `throw Error('Dynamic require of "' + name + '" is not supported')`;

    expect(() => assertStaticNodeBundle(bundle, "main.js")).toThrow(
      /main\.js contains an unsupported esbuild dynamic require shim/u,
    );
  });
});
