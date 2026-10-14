import { cn } from "@/lib/utils"

/**
 * The Context Compiler mark: a "C" built from lines of code, holding one highlighted line
 * (the context that matters). The C uses the current text color and the line uses the
 * theme's primary color, so it works in light and dark mode.
 */
export function AppLogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="10 12 44 40" aria-hidden="true" className={cn("size-5 shrink-0", className)}>
      <g fill="none" strokeLinecap="round" strokeWidth="5.4">
        <path d="M22 15H46M15 23.5H24M13 32H22M15 40.5H24M22 49H46" stroke="currentColor" />
        <path d="M30 32H51" className="stroke-primary" />
      </g>
    </svg>
  )
}
