import React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "success" | "warning" | "danger" | "info" | "neutral" | "brand";
  size?: "sm" | "md";
  showDot?: boolean;
}

export function Badge({
  className,
  variant = "neutral",
  size = "md",
  showDot = false,
  children,
  ...props
}: BadgeProps) {
  const variants = {
    success: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
    warning: "bg-amber-50 text-amber-700 border-amber-200/80",
    danger: "bg-rose-50 text-rose-700 border-rose-200/80",
    info: "bg-blue-50 text-blue-700 border-blue-200/80",
    neutral: "bg-slate-100 text-slate-700 border-slate-200",
    brand: "bg-brand-50 text-brand-700 border-brand-200/80"
  };

  const dotColors = {
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-rose-500",
    info: "bg-blue-500",
    neutral: "bg-slate-400",
    brand: "bg-brand-500"
  };

  const sizes = {
    sm: "px-2 py-0.5 text-[10px]",
    md: "px-2.5 py-1 text-xs"
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-medium rounded-full border transition-colors",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {showDot && (
        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotColors[variant])} />
      )}
      {children}
    </span>
  );
}

/**
 * Helper to get proper badge configuration by Order status string
 */
export function OrderStatusBadge({ 
  status, 
  size = "md", 
  className 
}: { 
  status: string; 
  size?: BadgeProps["size"]; 
  className?: string 
}) {
  let variant: BadgeProps["variant"] = "neutral";

  switch (status) {
    case "Entregado":
      variant = "success";
      break;
    case "Pendiente":
    case "Confirmado":
      variant = "info";
      break;
    case "Entregando":
      variant = "warning";
      break;
    case "Cancelado":
    case "Anulado":
      variant = "danger";
      break;
    default:
      variant = "neutral";
      break;
  }

  return (
    <Badge variant={variant} size={size} showDot className={className}>
      {status}
    </Badge>
  );
}
