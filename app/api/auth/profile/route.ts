import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/apiAuth'
import { NextResponse } from 'next/server'

export async function PATCH(request: Request) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  const supabase = await createClient()

  const body = await request.json().catch(() => ({}))
  const { first_name, last_name } = body

  if (first_name === undefined && last_name === undefined) {
    return NextResponse.json({ error: 'No fields provided' }, { status: 400 })
  }

  const trimmed: Record<string, string> = {}
  for (const [key, val] of Object.entries({ first_name, last_name })) {
    if (val === undefined) continue
    const t = String(val).trim()
    if (!t) return NextResponse.json({ error: `${key} cannot be empty` }, { status: 400 })
    trimmed[key] = t
  }

  const { error } = await supabase
    .from('profiles')
    .update(trimmed)
    .eq('id', gate.user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
