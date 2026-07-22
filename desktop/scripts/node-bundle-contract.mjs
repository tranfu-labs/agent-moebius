const esbuildDynamicRequireMarker = "Dynamic require of \"";

export function assertStaticNodeBundle(source, label = "Node bundle") {
  if (source.includes(esbuildDynamicRequireMarker)) {
    throw new Error(`${label} contains an unsupported esbuild dynamic require shim`);
  }
}
