import { cn } from "@/lib/utils";

/**
 * 成员标识：20px 彩色正圆 + 角色名首字。
 * 底色来自身份色板（tokens.css --ident-1…6，moebius-desktop-spec 6.6 采样），
 * 按 toneKey 稳定取色，同一角色全产品同色；标签为装饰性，旁边必须保留可读名称。
 */
export function RoleTag({
  label,
  toneKey,
  className,
}: {
  label: string;
  toneKey?: string;
  className?: string;
}): JSX.Element {
  const initial = Array.from(label.trim())[0] ?? "?";
  return (
    <span
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
        className,
      )}
      style={{
        backgroundColor: `var(${identityToken(toneKey ?? label)})`,
        color: "var(--ident-fg)",
      }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

const IDENTITY_TOKENS = ["--ident-1", "--ident-2", "--ident-3", "--ident-4", "--ident-5", "--ident-6"] as const;

export function identityToken(key: string): (typeof IDENTITY_TOKENS)[number] {
  let hash = 0;
  for (const char of key) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) | 0;
  }
  return IDENTITY_TOKENS[Math.abs(hash) % IDENTITY_TOKENS.length];
}
