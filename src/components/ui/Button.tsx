import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode;
  stretch?: boolean;
  variant?: "primary" | "secondary" | "danger" | "ghost";
}

const variants = {
  primary:
    "border-brand-600 bg-brand-600 text-white shadow-sm hover:bg-brand-700 dark:border-brand-400 dark:bg-brand-500 dark:hover:bg-brand-400",
  secondary:
    "border-slate-200 bg-white text-slate-700 hover:border-brand-200 hover:text-brand-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:border-brand-500/50 dark:hover:text-brand-100",
  danger:
    "border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200",
  ghost:
    "border-transparent bg-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5",
};

export function Button({
  children,
  className,
  icon,
  stretch,
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-[1.15rem] border px-4 py-3 text-[15px] font-semibold leading-5 transition disabled:cursor-not-allowed disabled:opacity-60 md:min-h-11 md:py-2.5 md:text-sm",
        variants[variant],
        stretch && "w-full",
        className,
      )}
      type={type}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
