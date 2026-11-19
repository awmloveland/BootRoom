// components/platform/DeleteLeague.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { deletePlatformLeague } from '@/lib/leagueApi'
import { pluralise } from '@/lib/utils'

interface Props {
  id: string
  name: string
  slug: string
  members: number
  players: number
  results: number
}

/** The danger zone card on a platform league page, and its type-to-confirm dialog. */
export function DeleteLeague({ id, name, slug, members, players, results }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setBusy(true)
    setError(null)
    try {
      await deletePlatformLeague(id, typed)
      router.push('/platform')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the league. Try again.')
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4 rounded-xl border border-[#e2686f]/40 bg-[#0a1421] p-4">
        <div>
          <p className="text-[15px] font-bold tracking-[-.02em] text-[#f4f9ff]">Delete this league</p>
          <p className="mt-1 font-inter-body text-xs leading-[1.55] text-[#8ba4c4]">
            Removes the league and everything in it. A copy is kept in the audit log for 30 days.
          </p>
        </div>
        <Button variant="destructive" size="sm" className="shrink-0 gap-2" onClick={() => setOpen(true)}>
          <Trash2 className="size-4" />
          Delete
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (busy) return
          setOpen(next)
          setTyped('')
          setError(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>
              This removes {pluralise(members, 'member')}, {pluralise(players, 'player')} and {pluralise(results, 'result')}. Members
              keep their accounts and nobody is emailed.
            </DialogDescription>
          </DialogHeader>
          <label className="block">
            <span className="font-inter-body text-xs text-[#8ba4c4]">
              Type <span className="font-plex font-bold text-[#f4f9ff]">{slug}</span> to confirm
            </span>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="mt-2"
            />
          </label>
          {error && <p role="alert" className="font-inter-body text-xs text-[#e2686f]">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" disabled={busy || typed !== slug} onClick={handleDelete}>
              Delete league
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
