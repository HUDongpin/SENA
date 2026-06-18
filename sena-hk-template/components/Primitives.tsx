import type React from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "dark";
export type ButtonSize = "sm" | "md" | "lg";

export function buttonStyles({
  className,
  variant = "primary",
  size = "md"
}: {
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
} = {}) {
  return cn(
    "group inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyanGlow disabled:pointer-events-none disabled:opacity-50",
    size === "sm" && "px-4 py-2 text-sm",
    size === "md" && "px-5 py-3 text-sm",
    size === "lg" && "px-6 py-4 text-base",
    variant === "primary" &&
      "bg-gradient-to-r from-cyanGlow via-violetGlow to-magentaGlow text-white shadow-glow hover:-translate-y-0.5 hover:brightness-110",
    variant === "secondary" &&
      "border border-cardBorder/60 bg-card/55 text-foreground shadow-soft backdrop-blur-xl hover:-translate-y-0.5 hover:border-cyanGlow/50 hover:bg-card/70",
    variant === "ghost" && "text-foreground/80 hover:bg-card/50 hover:text-foreground",
    variant === "dark" &&
      "bg-slate-950 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_14px_30px_rgb(0_0_0/0.28)] hover:-translate-y-0.5 hover:bg-slate-900",
    className
  );
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  type = "button",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button className={buttonStyles({ className, variant, size })} type={type} {...props}>
      {children}
    </button>
  );
}

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "glass-panel shine-effect rounded-[2rem] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-cyanGlow/45 hover:shadow-glow",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-cyanGlow/30 bg-cyanGlow/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] text-cyanGlow",
        className
      )}
    >
      {children}
    </span>
  );
}

export function SectionHeading({
  kicker,
  title,
  align = "center",
  className
}: {
  kicker: string;
  title: string;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div className={cn("mx-auto max-w-3xl", align === "center" ? "text-center" : "text-left", className)}>
      <Badge>{kicker}</Badge>
      <h2 className="mt-5 text-3xl font-black tracking-tight text-foreground sm:text-4xl lg:text-5xl">
        {title.split("SENA").length > 1 ? (
          <>
            {title.split("SENA")[0]}
            <span className="gradient-text">SENA</span>
            {title.split("SENA").slice(1).join("SENA")}
          </>
        ) : (
          title
        )}
      </h2>
    </div>
  );
}
