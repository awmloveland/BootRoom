// Old URLs were /app/league/<uuid>[/players|/settings] and /results/<uuid>[/players].
// Both now redirect to the slug-based league pages.
const KNOWN_SUBPATHS = new Set(['players', 'settings'])

export function legacyLeaguePath(slug: string, rest: string[] | undefined): string {
  const sub = rest?.[0]
  return sub && KNOWN_SUBPATHS.has(sub) ? `/${slug}/${sub}` : `/${slug}`
}
