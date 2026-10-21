// app/settings/loading.tsx
import { SkeletonCard, SKELETON_FADE_IN } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export default function AccountSettingsLoading() {
  return (
    <main className="max-w-xl mx-auto px-4 sm:px-6 py-8" aria-busy="true">
      <div className="mb-6">
        <div className="h-5 w-12 mb-3" />
        <h1 className="text-xl font-semibold text-[#f4f9ff]">Account</h1>
      </div>
      <div className={cn('flex flex-col gap-4', SKELETON_FADE_IN)}>
        <SkeletonCard rows={2} />
        <SkeletonCard rows={3} />
      </div>
    </main>
  )
}
