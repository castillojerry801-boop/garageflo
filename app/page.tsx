export const instant = false

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) redirect('/dashboard')

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16 bg-background relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `linear-gradient(#00aeef 1px, transparent 1px), linear-gradient(90deg, #00aeef 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative z-10 flex flex-col items-center text-center max-w-2xl mx-auto gap-8">
        <div className="flex flex-col items-center gap-4">
          <Image
            src="/logo.jpeg"
            alt="GarageFlo"
            width={160}
            height={160}
            className="rounded-2xl shadow-2xl"
            priority
          />
          <div>
            <h1 className="text-5xl font-black tracking-tight">
              <span className="text-foreground">Garage</span>
              <span className="text-primary">Flo</span>
            </h1>
            <p className="text-muted-foreground text-lg mt-2">
              Your garage. All your rides. Zero excuses.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 text-left w-full max-w-sm">
          {[
            '🚗 Track all your vehicles & equipment',
            '🔧 Log every service and repair',
            '⏰ Get reminders before maintenance is due',
            '📎 Store photos, receipts & documents',
          ].map((item) => (
            <div key={item} className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3">
              <span className="text-sm font-medium text-foreground">{item}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
          <Link
            href="/signup"
            className={cn(buttonVariants({ size: 'lg' }), 'flex-1 font-bold text-base h-12 bg-primary text-primary-foreground hover:bg-primary/90')}
          >
            Get Started Free
          </Link>
          <Link
            href="/login"
            className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'flex-1 font-bold text-base h-12 border-border hover:bg-secondary')}
          >
            Sign In
          </Link>
        </div>
      </div>
    </main>
  )
}
