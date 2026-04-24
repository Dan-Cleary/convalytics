import { forwardRef } from "react";
import type { ButtonHTMLAttributes, CSSProperties } from "react";

/**
 * Primary brutalist button used across Convalytics. Gives every CTA the same
 * hover-darken + mousedown press-in feedback so interactions feel consistent.
 *
 * Variants:
 *  - primary: orange bg (main CTA)
 *  - secondary: cream bg (neutral)
 *  - destructive: red bg (dangerous, irreversible-looking actions)
 *
 * The press animation shifts the element 2px down-right and collapses the
 * drop shadow from 3×3 to 1×1 — feels like the button physically pushes into
 * the page. Disabled buttons skip all interactive styling.
 */

type Variant = "primary" | "dark" | "secondary" | "destructive";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const PALETTE: Record<Variant, { bg: string; hoverBg: string; color: string }> = {
  primary: { bg: "#e8651c", hoverBg: "#c9581a", color: "#fff" },
  dark: { bg: "#1a1814", hoverBg: "#2e2a22", color: "#fff" },
  secondary: { bg: "#fff", hoverBg: "#e9e6db", color: "#1a1814" },
  destructive: { bg: "#c2362b", hoverBg: "#9e2923", color: "#fff" },
};

const SIZE_CLASS: Record<Size, string> = {
  sm: "px-3 py-1.5 text-[10px]",
  md: "px-4 py-2 text-xs",
};

const BASE_SHADOW = "3px 3px 0px #1a1814";
const PRESSED_SHADOW = "1px 1px 0px #1a1814";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    className = "",
    style,
    children,
    disabled,
    onMouseEnter,
    onMouseLeave,
    onMouseDown,
    onMouseUp,
    ...rest
  },
  ref,
) {
  const palette = PALETTE[variant];
  const mergedStyle: CSSProperties = {
    background: palette.bg,
    color: palette.color,
    border: "2px solid #1a1814",
    boxShadow: BASE_SHADOW,
    transition:
      "transform 80ms ease-out, box-shadow 80ms ease-out, background 120ms ease-out",
    ...style,
  };

  return (
    <button
      ref={ref}
      disabled={disabled}
      className={`font-bold uppercase tracking-widest cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${SIZE_CLASS[size]} ${className}`}
      style={mergedStyle}
      onMouseEnter={(e) => {
        if (!e.currentTarget.disabled) e.currentTarget.style.background = palette.hoverBg;
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        if (!e.currentTarget.disabled) e.currentTarget.style.background = palette.bg;
        onMouseLeave?.(e);
      }}
      onMouseDown={(e) => {
        if (!e.currentTarget.disabled) {
          e.currentTarget.style.transform = "translate(2px, 2px)";
          e.currentTarget.style.boxShadow = PRESSED_SHADOW;
        }
        onMouseDown?.(e);
      }}
      onMouseUp={(e) => {
        if (!e.currentTarget.disabled) {
          e.currentTarget.style.transform = "translate(0, 0)";
          e.currentTarget.style.boxShadow = BASE_SHADOW;
        }
        onMouseUp?.(e);
      }}
      {...rest}
    >
      {children}
    </button>
  );
});
