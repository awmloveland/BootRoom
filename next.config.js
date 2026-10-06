/** @type {import('next').NextConfig} */
const nextConfig = {
  // The preview images read these TTFs from disk at runtime. File tracing
  // cannot see a path built from process.cwd(), so include them per route.
  outputFileTracingIncludes: {
    '/api/og/lineup': ['./assets/fonts/**/*'],
    '/api/og/result': ['./assets/fonts/**/*'],
    '/api/og/quarter': ['./assets/fonts/**/*'],
    '/api/og/league': ['./assets/fonts/**/*'],
    '/api/og/invite': ['./assets/fonts/**/*'],
    '/api/og/default': ['./assets/fonts/**/*'],
  },
}

module.exports = nextConfig
