import Image from 'next/image'
import { Car, Truck, Bike, Ship, Waves, Snowflake, Leaf, Zap, Package, Wrench, Tractor } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { VehicleType } from '@/types'

type VehicleVisual = {
  Icon: React.ElementType
  bg: string
  glow: string
}

const VISUALS: Record<VehicleType, VehicleVisual> = {
  car:                 { Icon: Car,       bg: 'from-[#040c1c] via-[#071428] to-[#030810]', glow: '#00B8F5' },
  truck:               { Icon: Truck,     bg: 'from-[#050c18] via-[#081422] to-[#030810]', glow: '#38bdf8' },
  suv:                 { Icon: Car,       bg: 'from-[#040c1c] via-[#071428] to-[#030810]', glow: '#00B8F5' },
  motorcycle:          { Icon: Bike,      bg: 'from-[#1c0c06] via-[#201210] to-[#0e0806]', glow: '#f97316' },
  dirt_bike:           { Icon: Bike,      bg: 'from-[#1c1008] via-[#201510] to-[#0e0a06]', glow: '#f59e0b' },
  utv:                 { Icon: Tractor,   bg: 'from-[#141208] via-[#1c1a0a] to-[#0a0c06]', glow: '#a3e635' },
  atv:                 { Icon: Tractor,   bg: 'from-[#141208] via-[#1c1a0a] to-[#0a0c06]', glow: '#84cc16' },
  boat:                { Icon: Ship,      bg: 'from-[#040e1e] via-[#061626] to-[#030a14]', glow: '#38bdf8' },
  personal_watercraft: { Icon: Waves,     bg: 'from-[#040e1e] via-[#061626] to-[#030a14]', glow: '#7dd3fc' },
  snowmobile:          { Icon: Snowflake, bg: 'from-[#040e20] via-[#061828] to-[#030a16]', glow: '#bae6fd' },
  riding_mower:        { Icon: Tractor,   bg: 'from-[#040e04] via-[#061406] to-[#030a03]', glow: '#4ade80' },
  push_mower:          { Icon: Leaf,      bg: 'from-[#040e04] via-[#061406] to-[#030a03]', glow: '#86efac' },
  generator:           { Icon: Zap,       bg: 'from-[#140e00] via-[#1c1400] to-[#0a0800]', glow: '#fbbf24' },
  trailer:             { Icon: Package,   bg: 'from-[#0a0a0a] via-[#141414] to-[#060606]', glow: '#94a3b8' },
  camp_trailer:        { Icon: Package,   bg: 'from-[#060e04] via-[#0a1606] to-[#040a03]', glow: '#86efac' },
  other:               { Icon: Wrench,    bg: 'from-[#060c14] via-[#0a1422] to-[#040810]', glow: '#00B8F5' },
}

export interface VehicleImageProps {
  photoUrl?: string | null
  type: VehicleType
  name: string
  fill?: boolean
  /** Applied to the <img> element when rendering a real photo (e.g. hover scale). */
  imageClassName?: string
  sizes?: string
  priority?: boolean
  /**
   * Future extension points — not wired to any image API in this pass.
   * Defined here so the call-site prop interface is stable as features are added.
   */
  resolvedImageUrl?: string
  factoryColor?: string
}

export function VehicleImage({
  photoUrl,
  type,
  name,
  fill,
  imageClassName,
  sizes,
  priority,
}: VehicleImageProps) {
  if (photoUrl) {
    return (
      <Image
        src={photoUrl}
        alt={name}
        fill={fill}
        sizes={sizes}
        priority={priority}
        className={cn('object-cover', imageClassName)}
      />
    )
  }

  const { Icon, bg, glow } = VISUALS[type] ?? VISUALS.other

  return (
    <div
      className={cn(fill ? 'absolute inset-0' : 'relative w-full h-full', 'overflow-hidden select-none')}
      aria-hidden="true"
    >
      {/* Gradient base */}
      <div className={cn('absolute inset-0 bg-gradient-to-br', bg)} />

      {/* Soft radial glow centred on the icon */}
      <div
        className="absolute inset-0"
        style={{ background: `radial-gradient(ellipse 60% 55% at 50% 58%, ${glow}1c 0%, transparent 72%)` }}
      />

      {/* Subtle grid texture */}
      <div
        className="absolute inset-0 opacity-[0.032]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />

      {/* Vehicle type icon */}
      <div className="absolute inset-0 flex items-center justify-center">
        <Icon
          className="w-16 h-16 sm:w-20 sm:h-20 shrink-0"
          style={{ color: glow, opacity: 0.13 }}
          strokeWidth={1}
        />
      </div>
    </div>
  )
}
