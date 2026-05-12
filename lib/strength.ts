import type { Strength } from '@/lib/types'
export type { Strength }

export function strengthToRating(strength: Strength): number {
  switch (strength) {
    case 'below':   return 1
    case 'average': return 2
    case 'above':   return 3
  }
}

export function ratingToStrength(rating: number): Strength | null {
  if (rating === 1) return 'below'
  if (rating === 2) return 'average'
  if (rating === 3) return 'above'
  return null
}
