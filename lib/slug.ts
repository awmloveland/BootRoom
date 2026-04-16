import { generateSlug } from '@/lib/utils'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Generates a unique slug for a league name.
 * Queries the DB to check uniqueness, appending -2, -3, etc. on collision.
 *
 * @param name - The league name to slugify
 * @param excludeId - The game UUID to exclude when checking (use during rename
 *   so the current league's own slug is not treated as a collision)
 */
export async function resolveUniqueSlug(name: string, excludeId?: string): Promise<string> {
  const service = createServiceClient()
  const base = generateSlug(name)
  let candidate = base
  let counter = 2

  while (true) {
    let query = service
      .from('games')
      .select('id')
      .eq('slug', candidate)

    if (excludeId) {
      query = query.neq('id', excludeId)
    }

    const { data } = await query.maybeSingle()
    if (!data) return candidate

    candidate = `${base}-${counter}`
    counter++
  }
}
