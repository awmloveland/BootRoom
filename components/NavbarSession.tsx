import { getNavSession } from '@/lib/fetchers'
import { Navbar } from '@/components/ui/navbar'

/**
 * Resolves the viewer on the server and renders the client navbar with the
 * result. Sits inside a Suspense boundary in the root layout, so the page
 * shell streams without waiting on the auth lookup.
 */
export async function NavbarSession() {
  const session = await getNavSession()
  return <Navbar session={session} />
}
