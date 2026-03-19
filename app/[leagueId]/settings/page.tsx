'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Check, Copy, Link as LinkIcon, Users } from 'lucide-react'
import { fetchGames } from '@/lib/data'
import { AdminMemberTable } from '@/components/AdminMemberTable'
import { cn } from '@/lib/utils'
import type { LeagueMember } from '@/lib/types'

type Section = 'links' | 'members'

export default function LeagueSettingsPage() {
  const params = useParams()
  const router = useRouter()
  const leagueId = (params?.leagueId as string) ?? ''

  const [section, setSection] = useState<Section>('links')
  const [leagueName, setLeagueName] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  // Links state
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [copiedInvite, setCopiedInvite] = useState(false)

  // Members state
  const [members, setMembers] = useState<LeagueMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)

  useEffect(() => {
    async function init() {
      try {
        const games = await fetchGames()
        const game = games.find((g) => g.id === leagueId)
        if (!game) { router.replace('/'); return }
        setLeagueName(game.name)
        const adminRoles = ['creator', 'admin']
        if (!adminRoles.includes(game.role)) {
          router.replace(`/${leagueId}/results`)
          return
        }
        setIsAdmin(true)
      } catch {
        router.replace('/')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [leagueId, router])

  const loadMembers = useCallback(async () => {
    setMembersLoading(true)
    try {
      const res = await fetch(`/api/league/${leagueId}/members`, { credentials: 'include' })
      const data = await res.json()
      setMembers(Array.isArray(data) ? data : [])
    } catch {
      setMembers([])
    } finally {
      setMembersLoading(false)
    }
  }, [leagueId])

  useEffect(() => {
    if (!isAdmin) return
    if (section === 'members') loadMembers()
  }, [section, isAdmin, loadMembers])

  async function generateInviteLink() {
    setInviteLoading(true)
    setInviteError(null)
    try {
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: leagueId }),
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create invite')
      setInviteLink(data.link)
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setInviteLoading(false)
    }
  }

  async function copyInviteLink(text: string) {
    await navigator.clipboard.writeText(text)
    setCopiedInvite(true)
    setTimeout(() => setCopiedInvite(false), 2000)
  }

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </div>
    )
  }

  const NAV: { id: Section; label: string; icon: React.ReactNode }[] = [
    { id: 'links',   label: 'Links',   icon: <LinkIcon className="size-4" /> },
    { id: 'members', label: 'Members', icon: <Users className="size-4" /> },
  ]

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-100">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">{leagueName}</p>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-700">
        {NAV.map((nav) => (
          <button
            key={nav.id}
            onClick={() => setSection(nav.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              section === nav.id
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            )}
          >
            {nav.icon}
            {nav.label}
          </button>
        ))}
      </div>

      {/* ── LINKS ── */}
      {section === 'links' && (
        <div className="space-y-4">

          {/* Invite link */}
          <div className="p-4 rounded-lg bg-slate-800 border border-slate-700">
            <div className="mb-3">
              <p className="text-sm font-medium text-slate-200">Admin Invite Link</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Share with people you want to give admin access. Valid for 7 days.
              </p>
            </div>

            {inviteError && <p className="text-sm text-red-400 mb-2">{inviteError}</p>}

            {inviteLink ? (
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs text-slate-300 bg-slate-900 rounded px-2 py-1.5 truncate">
                  {inviteLink}
                </code>
                <button
                  onClick={() => copyInviteLink(inviteLink)}
                  className="flex items-center gap-1.5 text-xs font-medium text-sky-400 hover:text-sky-300 transition-colors shrink-0"
                >
                  {copiedInvite ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {copiedInvite ? 'Copied' : 'Copy'}
                </button>
              </div>
            ) : (
              <button
                onClick={generateInviteLink}
                disabled={inviteLoading}
                className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {inviteLoading ? 'Generating…' : 'Generate invite link'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── MEMBERS ── */}
      {section === 'members' && (
        <div>
          {membersLoading ? (
            <p className="text-slate-400 text-sm">Loading members…</p>
          ) : (
            <AdminMemberTable
              leagueId={leagueId}
              members={members}
              onChanged={loadMembers}
            />
          )}
        </div>
      )}
    </main>
  )
}
