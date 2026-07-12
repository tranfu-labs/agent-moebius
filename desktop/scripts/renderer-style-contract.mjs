const forbiddenDirectives = ["@tailwind", "@apply"];
const requiredUtilities = [
  [".flex", /(?:^|[}\s])\.flex\s*\{/u],
  [".grid", /(?:^|[}\s])\.grid\s*\{/u],
  [".bg-canvas", /(?:^|[}\s])\.bg-canvas\s*\{/u],
  [".text-ink", /(?:^|[}\s])\.text-ink\s*\{/u],
];

export function assertCompiledRendererStyles(css) {
  const remainingDirectives = forbiddenDirectives.filter((directive) => css.includes(directive));
  if (remainingDirectives.length > 0) {
    throw new Error(`renderer CSS contains uncompiled directives: ${remainingDirectives.join(", ")}`);
  }

  const missingUtilities = requiredUtilities
    .filter(([, pattern]) => !pattern.test(css))
    .map(([utility]) => utility);
  if (missingUtilities.length > 0) {
    throw new Error(`renderer CSS is missing console-ui utilities: ${missingUtilities.join(", ")}`);
  }
}
