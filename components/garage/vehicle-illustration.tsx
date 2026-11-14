'use client'

import { cn } from '@/lib/utils'

export interface VehicleIllustrationProps {
  type?: string
  name?: string
  className?: string
}

export function VehicleIllustration({ name, className }: VehicleIllustrationProps) {
  const initials = name
    ? name.trim().split(/\s+/).map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase()
    : ''

  return (
    <div
      className={cn('relative overflow-hidden select-none', className)}
      style={{ background: 'linear-gradient(145deg, #0c0f18 0%, #0a0d16 100%)' }}
      aria-hidden="true"
    >
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 55% 45% at 50% 55%, #141c2e 0%, transparent 65%)' }}
      />
      {initials && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span
            className="font-black text-white select-none"
            style={{ fontSize: '5rem', opacity: 0.045, letterSpacing: '-0.03em', lineHeight: 1 }}
          >
            {initials}
          </span>
        </div>
      )}
    </div>
  )
}
