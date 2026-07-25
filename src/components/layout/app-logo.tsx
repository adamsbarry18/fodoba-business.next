import Image from "next/image"
import { cn } from "@/lib/utils"
import { getAppName } from "@/lib/constants/branding"

const sizeClasses = {
  sm: "h-9 w-9",
  md: "h-10 w-10",
  lg: "h-14 w-14",
  xl: "h-20 w-20",
  "2xl": "h-28 w-28",
  hero: "h-32 w-32 sm:h-36 sm:w-36",
} as const

const sizePixels = {
  sm: "36px",
  md: "40px",
  lg: "56px",
  xl: "80px",
  "2xl": "112px",
  hero: "144px",
} as const

interface AppLogoProps {
  size?: keyof typeof sizeClasses
  className?: string
  /** LCP / above-the-fold (login, loading screen) */
  priority?: boolean
}

export function AppLogo({ size = "sm", className, priority }: AppLogoProps) {
  const eager =
    priority ?? (size === "hero" || size === "2xl" || size === "lg")

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full bg-white shadow-sm ring-1 ring-border/60",
        sizeClasses[size],
        className
      )}
    >
      <Image
        src="/images/logo.png"
        alt={getAppName()}
        fill
        className="object-cover"
        sizes={sizePixels[size]}
        priority={eager}
      />
    </div>
  )
}
