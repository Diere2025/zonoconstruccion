import * as React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "link" | "success" | "destructive";
  size?: "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", isLoading = false, children, disabled, ...props }, ref) => {
    const variants = {
      primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-xs border border-brand-700/20 active:bg-brand-800",
      secondary: "bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200/80 active:bg-slate-300",
      outline: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-2xs active:bg-slate-100",
      ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200",
      link: "text-brand-600 underline-offset-4 hover:underline p-0 h-auto font-medium",
      success: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs border border-emerald-700/20 active:bg-emerald-800",
      destructive: "bg-rose-600 text-white hover:bg-rose-700 shadow-xs border border-rose-700/20 active:bg-rose-800"
    };

    const sizes = {
      sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
      md: "h-10 px-4 text-xs font-semibold gap-2 rounded-xl",
      lg: "h-12 px-6 text-sm font-semibold gap-2.5 rounded-xl",
      icon: "h-9 w-9 p-0 rounded-xl",
    };

    return (
      <button
        className={cn(
          "inline-flex items-center justify-center font-medium transition-all duration-150 cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
          variants[variant],
          sizes[size],
          className
        )}
        ref={ref}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button };
