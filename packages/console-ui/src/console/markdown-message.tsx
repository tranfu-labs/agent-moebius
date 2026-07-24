import { code } from "@streamdown/code";
import { cjk } from "@streamdown/cjk";
import { createMathPlugin } from "@streamdown/math";
import { createMermaidPlugin } from "@streamdown/mermaid";
import { ExternalLink } from "lucide-react";
import { harden } from "rehype-harden";
import { useMemo, useState, type ComponentPropsWithoutRef } from "react";
import { defaultRehypePlugins, Streamdown, type StreamdownProps } from "streamdown";

import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";

export interface MarkdownMessageProps {
  content: string;
  mode?: "static" | "streaming";
  density?: "conversation" | "live";
  onOpenExternalLink?: (url: string) => void;
  className?: string;
}

const math = createMathPlugin({ singleDollarTextMath: false, errorColor: "var(--sub)" });
const mermaid = createMermaidPlugin({ config: { securityLevel: "strict" } });
const markdownPlugins = { code, cjk, math, mermaid };
const secureRehypePlugins: NonNullable<StreamdownProps["rehypePlugins"]> = [
  defaultRehypePlugins.raw,
  defaultRehypePlugins.sanitize,
  [harden, {
    allowedLinkPrefixes: ["*"],
    allowedImagePrefixes: ["*"],
    allowDataImages: false,
    linkBlockPolicy: "text-only",
    imageBlockPolicy: "text-only",
  }],
];

export function MarkdownMessage({
  content,
  mode = "static",
  density = "conversation",
  onOpenExternalLink,
  className,
}: MarkdownMessageProps): JSX.Element {
  const components = useMemo<NonNullable<StreamdownProps["components"]>>(() => ({
    a: (props) => <SafeMarkdownLink {...props} onOpenExternalLink={onOpenExternalLink} />,
  }), [onOpenExternalLink]);
  const streaming = mode === "streaming";

  return (
    <Streamdown
      key={mode === "streaming" ? content : "static"}
      className={cn(
        "markdown-message min-w-0 max-w-full text-ink",
        density === "live" ? "text-sm text-sub" : "text-sm leading-6",
        className,
      )}
      components={components}
      controls={{
        table: { copy: true, download: true, fullscreen: true },
        code: { copy: true, download: true },
        mermaid: { copy: true, download: true, fullscreen: true, panZoom: true },
      }}
      dir="auto"
      isAnimating={streaming}
      animated={streaming ? { animation: "fadeIn", duration: 120, sep: "word", stagger: 4 } : false}
      caret={streaming ? "block" : undefined}
      linkSafety={{ enabled: false }}
      mermaid={{ config: { securityLevel: "strict" } }}
      mode={mode}
      normalizeHtmlIndentation
      parseIncompleteMarkdown={false}
      plugins={markdownPlugins}
      rehypePlugins={secureRehypePlugins}
      urlTransform={safeMarkdownUrlTransform}
    >
      {content}
    </Streamdown>
  );
}

type SafeMarkdownLinkProps = ComponentPropsWithoutRef<"a"> & {
  node?: unknown;
  onOpenExternalLink?: (url: string) => void;
};

function SafeMarkdownLink({
  children,
  href,
  node: _node,
  onOpenExternalLink,
}: SafeMarkdownLinkProps): JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const safeUrl = normalizeMarkdownUrl(href, "link");

  if (safeUrl?.startsWith("#")) {
    return <a className="font-medium text-accent underline" href={safeUrl}>{children}</a>;
  }
  if (safeUrl === null || onOpenExternalLink === undefined) {
    return <span className="break-words text-sub underline decoration-dotted">{children}</span>;
  }

  return (
    <span className="relative inline">
      <button
        type="button"
        className="inline break-words text-left font-medium text-accent underline"
        onClick={() => setConfirming(true)}
      >
        {children}
      </button>
      {confirming ? (
        <span
          role="dialog"
          aria-label="确认打开外部链接"
          className="absolute left-0 top-full z-30 mt-2 block w-[min(360px,80vw)] rounded-md border border-line bg-sunken p-3 text-left text-xs font-normal text-ink"
        >
          <span className="block break-all text-sub">{safeUrl}</span>
          <span className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              取消
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => {
                setConfirming(false);
                onOpenExternalLink(safeUrl);
              }}
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              打开链接
            </Button>
          </span>
        </span>
      ) : null}
    </span>
  );
}

export function safeMarkdownUrlTransform(url: string, key: string): string | null {
  if (key === "href" && url.startsWith("#")) {
    return /^#[A-Za-z][\w:.-]*$/u.test(url) ? url : null;
  }
  return normalizeMarkdownUrl(url, key === "src" ? "image" : key === "href" ? "link" : "unsupported");
}

function normalizeMarkdownUrl(
  value: string | null | undefined,
  kind: "link" | "image" | "unsupported",
): string | null {
  if (typeof value !== "string" || value.trim() === "" || kind === "unsupported") {
    return null;
  }
  if (kind === "link" && value.startsWith("#")) {
    return /^#[A-Za-z][\w:.-]*$/u.test(value) ? value : null;
  }
  try {
    const url = new URL(value);
    const allowed = kind === "image"
      ? url.protocol === "http:" || url.protocol === "https:"
      : url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:";
    return allowed ? url.href : null;
  } catch {
    return null;
  }
}
