/** @type {import('next').NextConfig} */
const nextConfig = {
  // The lineup preview image reads these TTFs from disk at runtime. File
  // tracing cannot see a path built from process.cwd(), so include them.
  outputFileTracingIncludes: {
    '/api/og/lineup': ['./assets/fonts/**/*'],
  },
}

module.exports = nextConfig
