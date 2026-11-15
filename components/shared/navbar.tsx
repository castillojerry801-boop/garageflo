'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Home, Settings, LogOut, ChevronDown } from 'lucide-react'
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
  const initials = name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()

  async function handleSignOut() {
    await supabase.auth.signOut()
    toast.success('Signed out')
    router.push('/login')
    router.refresh()
  }

  const navLinks = [
    { href: '/dashboard', label: 'My Garage', Icon: Home },
    { href: '/settings',  label: 'Settings',  Icon: Settings },
  ]

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/90 backdrop-blur-md">
      <div className="container max-w-6xl mx-auto flex h-14 sm:h-16 items-center justify-between px-4">

        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
          <Image src="/logo.jpeg" alt="GarageFlo" width={48} height={48} className="rounded-md w-10 h-10 sm:w-12 sm:h-12" />
          <span className="font-bold text-sm tracking-tight hidden sm:block">
            <span className="text-foreground">Garage</span><span className="text-primary">Flo</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-0.5">
          {navLinks.map(({ href, label }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                )}
              >
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Profile menu */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 hover:bg-secondary/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Avatar className="h-6 w-6 border border-border/60">
              <AvatarImage src={user.user_metadata?.avatar_url} />
              <AvatarFallback className="bg-secondary text-muted-foreground font-semibold text-[10px]">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="hidden sm:block text-xs font-medium max-w-24 truncate">
              {name.split(' ')[0]}
            </span>
            <ChevronDown className="hidden sm:block h-3 w-3 text-muted-foreground/60" />
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="bg-card border-border/60 w-48">
            <div className="px-3 py-2.5">
              <p className="text-xs font-semibold truncate">{name}</p>
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">{user.email}</p>
            </div>
            <DropdownMenuSeparator className="bg-border/50" />

            {navLinks.map(({ href, label, Icon }) => (
              <DropdownMenuItem
                key={href}
                className="cursor-pointer hover:bg-secondary/60 md:hidden text-sm"
                onClick={() => router.push(href)}
              >
                <Icon className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                {label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator className="bg-border/50 md:hidden" />

            <DropdownMenuItem
              onClick={handleSignOut}
              className="cursor-pointer text-sm text-danger hover:bg-danger/10 hover:text-danger focus:bg-danger/10 focus:text-danger"
            >
              <LogOut className="h-3.5 w-3.5 mr-2" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

      </div>
    </header>
  )
}
