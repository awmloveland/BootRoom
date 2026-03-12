export function Header() {
  return (
    <header className="sticky top-0 z-50 bg-slate-900 border-b border-slate-700 h-14 flex items-center">
      <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 flex items-center justify-between">
        <span className="text-xl font-bold text-slate-100">⚽ Craft Football</span>
        {/* Right side reserved for Phase 2 nav links */}
      </div>
    </header>
  )
}
