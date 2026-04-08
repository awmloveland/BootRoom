'use client'

import { forwardRef } from 'react'
import { cn, getInitials, getAvatarColor } from '@/lib/utils'

interface AvatarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  name: string
}

export const AvatarButton = forwardRef<HTMLButtonElement, AvatarButtonProps>(
  ({ name, className, ...props }, ref) => {
    const initials = getInitials(name)
    const color = getAvatarColor(name)

    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          'w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold tracking-wide',
          'transition-shadow hover:ring-2 hover:ring-slate-500',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 shrink-0',
          className
        )}
        style={{
          background: color.bg,
          border: `1px solid ${color.border}`,
          color: color.text,
        }}
        {...props}
      >
        {initials}
      </button>
    )
  }
)
AvatarButton.displayName = 'AvatarButton'
