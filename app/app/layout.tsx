import { Navbar } from '@/components/ui/navbar'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-slate-900">
      <Navbar />
      {children}
    </div>
  )
}
