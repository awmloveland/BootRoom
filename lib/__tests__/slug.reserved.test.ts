// lib/__tests__/slug.reserved.test.ts
import { readdirSync } from 'fs'
import { join } from 'path'
import { RESERVED } from '@/lib/slug'

// Every top-level route folder in app/ must be reserved, or a league named
// after it would be unreachable behind that route.
it('reserves every top-level route in app/', () => {
  const routes = readdirSync(join(process.cwd(), 'app'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('['))
    .map((d) => d.name)
  for (const route of routes) expect(RESERVED).toContain(route)
})
