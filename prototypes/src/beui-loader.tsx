/**
 * Adapted for the isolated moebius design prototype from:
 * https://beui.dev/components/motion/loader (variant: "dots")
 * Upstream project: https://github.com/starc007/ui-components
 * License: MIT
 *
 * Only the "dots" variant is copied and trimmed to prototype needs
 * (decorative typing indicator, reduced-motion falls back to an opacity
 * pulse). Prototype-only source; must not be imported by production
 * packages.
 */
import { motion, useReducedMotion } from "motion/react";

interface LoaderDotsProps {
  /** Base square size in px; the three dots scale from this. */
  size?: number;
}

export function LoaderDots({ size = 14 }: LoaderDotsProps) {
  const reduceMotion = useReducedMotion();
  const dot = Math.max(3, Math.round(size * 0.24));

  return (
    <span className="beui-dots" aria-hidden>
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          style={{ width: dot, height: dot }}
          animate={
            reduceMotion
              ? { opacity: [0.35, 1, 0.35] }
              : { opacity: [0.45, 1, 0.45], y: [0, -dot, 0] }
          }
          transition={{
            duration: reduceMotion ? 1.4 : 0.9,
            ease: "easeInOut",
            repeat: Infinity,
            delay: index * (reduceMotion ? 0.24 : 0.15)
          }}
        />
      ))}
    </span>
  );
}
