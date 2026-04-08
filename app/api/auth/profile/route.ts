import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const { first_name, last_name, display_name } = body

  // At least one field must be present
  if (first_name === undefined && last_name === undefined && display_name === undefined) {
    return NextResponse.json({ error: 'No fields provided' }, { status: 400 })
  }

  // Validate: if a field is present, it must not be empty after trimming
  const trimmed: Record<string, string> = {}
  for (const [key, val] of Object.entries({ first_name, last_name, display_name })) {
    if (val === undefined) continue
    const t = String(val).trim()
    if (!t) return NextResponse.json({ error: `${key} cannot be empty` }, { status: 400 })
    trimmed[key] = t
  }

  // When welcome flow sends first_name + last_name without display_name,
  // derive display_name so it is also populated
  if (trimmed.first_name !== undefined && trimmed.last_name !== undefined && trimmed.display_name === undefined) {
    trimmed.display_name = `${trimmed.first_name} ${trimmed.last_name}`.trim()
  }

  const { error } = await supabase
    .from('profiles')
    .update(trimmed)
    .eq('id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
