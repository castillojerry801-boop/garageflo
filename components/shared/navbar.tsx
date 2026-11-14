'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Home, Settings, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface NavbarProps {
  user: { email?: string; user_metadata?: { full_name?: string; avatar_url?: string } }
}

export function Navbar({ user }: NavbarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Driver'
  const initials = name.slice(0, 2).toUpperCase()

  async function handleSignOut() {
    await supabase.auth.signOut()
    toast.success('Signed out')
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="container max-w-6xl mx-auto flex h-14 items-center justify-between px-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image src="/logo.jpeg" alt="GarageFlo" width={32} height={32} className="rounded-lg" />
          <span className="font-black text-lg hidden sm:block">
            <span className="text-foreground">Garage</span>
            <span className="text-primary">Flo</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          <Link
            href="/dashboard"
            className={cn(
              buttonVariants({ variant: pathname === '/dashboard' ? 'secondary' : 'ghost', size: 'sm' }),
              'gap-1.5'
            )}
          >
            <Home className="h-4 w-4" />
            Garage
          </Link>
          <Link
            href="/settings"
            className={cn(
              buttonVariants({ variant: pathname === '/settings' ? 'secondary' : 'ghost', size: 'sm' }),
              'gap-1.5'
            )}
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger className="relative h-9 w-9 rounded-full p-0 hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar className="h-9 w-9 border-2 border-primary/30">
                <AvatarImage src={user.user_metadata?.avatar_url} />
                <AvatarFallback className="bg-primary/20 text-primary font-bold text-xs">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-card border-border w-48">
              <div className="px-3 py-2">
                <p className="text-sm font-medium truncate">{name}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                className="cursor-pointer hover:bg-secondary md:hidden"
                onClick={() => router.push('/dashboard')}
              >
                <Home className="h-4 w-4 mr-2" />
                Garage
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer hover:bg-secondary"
                onClick={() => router.push('/settings')}
              >
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="cursor-pointer text-danger hover:bg-danger/10 hover:text-danger focus:bg-danger/10 focus:text-danger"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
