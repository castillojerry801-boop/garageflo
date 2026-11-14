import { redirect } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { Navbar } from '@/components/shared/navbar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="min-h-screen flex flex-col">
      <div
        aria-hidden="true"
        className="fixed inset-0 z-0 pointer-events-none select-none bg-background"
      >
        <Image
          src="/garage-icon.png"
          alt=""
          fill
          draggable={false}
          priority
          className="object-cover"
          style={{
            opacity: 0.72,
            transform: 'scale(0.85)',
            transformOrigin: '50% 0%',
            maskImage: 'linear-gradient(to bottom, black 50%, transparent 82%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 50%, transparent 82%)',
          }}
        />
      </div>

      <Navbar user={user} />
      <main className="relative z-10 flex-1 container max-w-6xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
