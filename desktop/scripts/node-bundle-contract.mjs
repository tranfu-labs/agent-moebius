const esbuildDynamicRequireMarker = "Dynamic require of \"";
const sandboxedPreloadProcessRequire = /\brequire\(["'](?:node:)?process["']\)/u;

export function assertStaticNodeBundle(source, label = "Node bundle") {
  if (source.includes(esbuildDynamicRequireMarker)) {
    throw new Error(`${label} contains an unsupported esbuild dynamic require shim`);
  }
}

export function assertSandboxedPreloadBundle(source, label = "preload.cjs") {
  assertStaticNodeBundle(source, label);
  if (sandboxedPreloadProcessRequire.test(source)) {
    throw new Error(`${label} requires process, which is unavailable in Electron's sandboxed preload`);
  }
}
