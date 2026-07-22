const SESSION_TITLE_DISPLAY_WIDTH = 32;
const SESSION_TITLE_FALLBACK = "新会话";

export function deriveSessionTitle(body: string): string {
  const firstLine = body.split(/\r?\n/u, 1)[0] ?? "";
  const collapsed = firstLine.trim().replace(/[\t\f\v ]+/gu, " ");
  if (collapsed === "" || !/[\p{L}\p{N}]/u.test(collapsed)) {
    return SESSION_TITLE_FALLBACK;
  }

  if (displayWidth(collapsed) <= SESSION_TITLE_DISPLAY_WIDTH) {
    return collapsed;
  }

  const targetWidth = SESSION_TITLE_DISPLAY_WIDTH - displayWidth("…");
  let title = "";
  let width = 0;
  for (const character of collapsed) {
    const characterWidth = displayWidth(character);
    if (width + characterWidth > targetWidth) {
      break;
    }
    title += character;
    width += characterWidth;
  }
  return `${title}…`;
}

function displayWidth(value: string): number {
  let width = 0;
  for (const character of value) {
    if (/\p{Mark}/u.test(character)) {
      continue;
    }
    const codePoint = character.codePointAt(0) ?? 0;
    width += isWideCodePoint(codePoint) ? 2 : 1;
  }
  return width;
}

function isWideCodePoint(codePoint: number): boolean {
  return codePoint >= 0x1100 && (
    codePoint <= 0x115f
    || codePoint === 0x2329
    || codePoint === 0x232a
    || (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f)
    || (codePoint >= 0xac00 && codePoint <= 0xd7a3)
    || (codePoint >= 0xf900 && codePoint <= 0xfaff)
    || (codePoint >= 0xfe10 && codePoint <= 0xfe19)
    || (codePoint >= 0xfe30 && codePoint <= 0xfe6f)
    || (codePoint >= 0xff00 && codePoint <= 0xff60)
    || (codePoint >= 0xffe0 && codePoint <= 0xffe6)
    || (codePoint >= 0x1f300 && codePoint <= 0x1faff)
    || (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  );
}
