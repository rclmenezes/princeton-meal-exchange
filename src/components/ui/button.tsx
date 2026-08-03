import { forwardRef, type ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "outline" | "ghost" | "unstyled";
type ButtonSize = "default" | "sm" | "lg" | "icon" | "unstyled";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border-[var(--orange-edge)] bg-[var(--orange)] text-[var(--ink)] shadow-sm hover:bg-[#f18416]",
  outline:
    "border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] shadow-sm hover:bg-[var(--surface-2)]",
  ghost:
    "border-transparent bg-transparent text-[var(--ink-2)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]",
  unstyled: "",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "min-h-11 px-4 py-2.5 text-sm",
  sm: "min-h-10 px-4 py-2 text-sm",
  lg: "min-h-12 px-5 py-3 text-base",
  icon: "size-10 p-0",
  unstyled: "",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant = "primary",
      size = "default",
      type = "button",
      ...props
    },
    ref,
  ) {
    return (
      <button
        className={[
          "inline-flex items-center justify-center gap-2 rounded-lg border font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
          variantClasses[variant],
          sizeClasses[size],
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        ref={ref}
        type={type}
        {...props}
      />
    );
  },
);
