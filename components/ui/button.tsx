import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded text-[13px] font-bold ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-[#38bdf8] text-[#05101d] hover:bg-[#7dd3fc]",
        destructive:
          "border border-[#e2686f]/40 text-[#e2686f] hover:bg-[#e2686f]/10",
        outline:
          "border border-[#223a5c] bg-transparent text-[#cfe0f4] hover:border-[#38bdf8] hover:text-white",
        secondary:
          "bg-[#101d31] text-[#cfe0f4] hover:bg-[#1b2c46]",
        ghost: "text-[#8ba4c4] hover:bg-[#101d31] hover:text-[#f4f9ff]",
        link: "text-[#38bdf8] underline-offset-4 hover:text-[#7dd3fc] hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        xs: "h-8 px-3 text-xs",
        lg: "h-11 px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
