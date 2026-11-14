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
      {/*
        Full-screen background: garage icon at original colors, softened slightly,
        with a gradient tint that blends to full navy at the bottom — this eliminates
        the hard edge where the icon's transparent area meets the page background.
      */}
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
            filter: 'contrast(0.88) brightness(1.02)',
            maskImage: 'linear-gradient(to bottom, black 42%, transparent 76%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 42%, transparent 76%)',
          }}
        />
        {/* Uniform navy tint — image mask handles the bottom fade */}
        <div className="absolute inset-0 bg-[#191E2D]/52" />
      </div>

      <Navbar user={user} />
      <main className="relative z-10 flex-1 container max-w-6xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
