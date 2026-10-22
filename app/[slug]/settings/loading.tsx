import { Skeleton, SkeletonCard, SKELETON_FADE_IN } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export default function LeagueSettingsLoading() {
  return (
    <main className="max-w-[624px] mx-auto px-4 sm:px-6 pt-7 pb-14" aria-busy="true">
      <Skeleton className="h-[13px] w-12" />
      <h1 className="mt-3.5 text-[26px] sm:text-[30px] leading-none font-bold tracking-[-.035em] text-[#f4f9ff]">Settings</h1>
      <div className="mt-2 flex h-[15px] items-center">
        <Skeleton className="h-2.5 w-32" />
      </div>
      <div className="mt-[22px] mb-6 h-[34px] border-b border-[#17263c]" />
      <div className={cn('flex flex-col gap-3', SKELETON_FADE_IN)}>
        <SkeletonCard rows={6} />
      </div>
    </main>
  )
}
