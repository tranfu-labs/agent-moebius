import { RotateCcw } from "lucide-react";

import { Button } from "@/ui/button";

export function RelayReplayButton({ onReplay }: { onReplay: () => void }): JSX.Element {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="shrink-0 text-xs"
      onClick={onReplay}
      data-testid="replay-relay"
    >
      <RotateCcw className="h-3 w-3" strokeWidth={1.7} aria-hidden="true" />
      重新播放
    </Button>
  );
}
