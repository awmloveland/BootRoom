'use client'

import { forwardRef } from 'react'
import { cn, getInitials } from '@/lib/utils'

interface AvatarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  name: string
}

export const AvatarButton = forwardRef<HTMLButtonElement, AvatarButtonProps>(
  ({ name, className, ...props }, ref) => {
    const initials = getInitials(name)

    return (
      <button
        ref={ref}
        type="button"
        aria-label={name ? `Account menu for ${name}` : 'Account menu'}
        className={cn(
          'w-[34px] h-[34px] rounded-full flex items-center justify-center shrink-0',
          'border border-[#223a5c] bg-[#0c1728] text-[#7dd3fc] font-plex text-[11px] font-bold tracking-[.06em]',
          'transition-colors hover:border-[#38bdf8]',
          'focus-visible:outline-none focus-visible:border-[#38bdf8]',
          className
        )}
        {...props}
      >
        {initials}
      </button>
    )
  }
)
AvatarButton.displayName = 'AvatarButton'
