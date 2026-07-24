import moebiusLogoUrl from "../../../../assets/brand/generated/ui-icon-64.png";

export interface MoebiusLogoProps {
  className?: string;
  decorative?: boolean;
}

export function MoebiusLogo({
  className = "h-6 w-6",
  decorative = false,
}: MoebiusLogoProps): JSX.Element {
  return (
    <img
      src={moebiusLogoUrl}
      alt={decorative ? "" : "Moebius Logo"}
      aria-hidden={decorative ? "true" : undefined}
      className={`block shrink-0 object-contain ${className}`.trim()}
      draggable={false}
      data-testid="moebius-logo"
    />
  );
}
