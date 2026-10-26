// lib/redirect.ts
// Where to send someone after signing in.

/**
 * A same-site path to send someone to after signing in, taken from a
 * `?redirect=` value. Anything that could leave the site (absolute URLs,
 * protocol-relative '//host', backslash tricks, '@host') falls back.
 */
export function safeRedirectPath(value: string | null | undefined, fallback = '/'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback
  if ([...value].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)) return fallback
  const base = 'https://same-site.invalid'
  try {
    const url = new URL(value, base)
    if (url.origin !== base) return fallback
    return url.pathname + url.search + url.hash
  } catch {
    return fallback
  }
}
