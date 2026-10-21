// A mocked `auth` namespace matching lib/supabase/session.ts, for route and
// fetcher tests. Pass null for a signed-out caller.
export function mockAuthNamespace(user: { id: string; email?: string } | null) {
  return {
    getClaims: jest.fn().mockResolvedValue(
      user
        ? { data: { claims: { sub: user.id, email: user.email ?? null } }, error: null }
        : { data: null, error: null }
    ),
    getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }),
  }
}
