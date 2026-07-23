/**
 * Adapted for the isolated agent-moebius design prototype from:
 * https://beui.dev/components/motion/button
 * Upstream project: https://github.com/starc007/ui-components
 * License: MIT
 *
 * This is prototype-only source. It intentionally uses local CSS classes and
 * must not be imported by production packages.
 */
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type HTMLMotionProps
} from "motion/react";
import {
  forwardRef,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useRef,
  useState
} from "react";

export const SPRING_PRESS = {
  type: "spring",
  stiffness: 500,
  damping: 30,
  mass: 0.6
} as const;

export const SPRING_LAYOUT = {
  type: "spring",
  stiffness: 360,
  damping: 32,
  mass: 0.6
} as const;

export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

type PrototypeButtonVariant = "primary" | "secondary" | "ghost";

interface PrototypeButtonProps
  extends Omit<HTMLMotionProps<"button">, "children"> {
  children: ReactNode;
  variant?: PrototypeButtonVariant;
  ripple?: boolean;
}

type Ripple = {
  id: number;
  x: number;
  y: number;
  size: number;
};

export const PrototypeButton = forwardRef<
  HTMLButtonElement,
  PrototypeButtonProps
>(function PrototypeButton(
  {
    children,
    variant = "primary",
    ripple = false,
    className,
    onPointerDown,
    ...rest
  },
  ref
) {
  const reduceMotion = useReducedMotion();
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const nextId = useRef(0);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      if (ripple && !reduceMotion) {
        const rect = event.currentTarget.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height) * 2;
        setRipples((current) => [
          ...current,
          {
            id: nextId.current++,
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
            size
          }
        ]);
      }

      onPointerDown?.(event);
    },
    [onPointerDown, reduceMotion, ripple]
  );

  return (
    <motion.button
      ref={ref}
      type="button"
      whileTap={reduceMotion ? undefined : { scale: 0.95 }}
      whileHover={reduceMotion ? undefined : { y: -1 }}
      transition={SPRING_PRESS}
      onPointerDown={handlePointerDown}
      className={[
        "prototype-button",
        `prototype-button--${variant}`,
        className
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {ripple && !reduceMotion ? (
        <span className="prototype-button__ripple-layer" aria-hidden>
          <AnimatePresence>
            {ripples.map((item) => (
              <motion.span
                key={item.id}
                className="prototype-button__ripple"
                style={{
                  left: item.x,
                  top: item.y,
                  width: item.size,
                  height: item.size
                }}
                initial={{ scale: 0.05, opacity: 0.22 }}
                animate={{ scale: 1, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.3, ease: EASE_OUT }}
                onAnimationComplete={() => {
                  setRipples((current) =>
                    current.filter((rippleItem) => rippleItem.id !== item.id)
                  );
                }}
              />
            ))}
          </AnimatePresence>
        </span>
      ) : null}
      <span className="prototype-button__content">{children}</span>
    </motion.button>
  );
});
