import Link from 'next/link'
import Image from 'next/image'
import { Vehicle, Reminder, getReminderStatus, VEHICLE_TYPE_LABELS } from '@/types'
import { cn } from '@/lib/utils'

interface VehicleCardProps {
  vehicle: Vehicle
  reminders?: Reminder[]
}

export function VehicleCard({ vehicle, reminders = [] }: VehicleCardProps) {
  const typeLabel = VEHICLE_TYPE_LABELS[vehicle.type] || 'Vehicle'

  const worstStatus = reminders.reduce<'overdue' | 'due_soon' | 'ok'>((worst, r) => {
    const s = getReminderStatus(r, vehicle.mileage)
    if (s === 'overdue') return 'overdue'
    if (s === 'due_soon' && worst !== 'overdue') return 'due_soon'
    return worst
  }, 'ok')

  const hasReminders = reminders.length > 0
  const hasUrgent = hasReminders && worstStatus !== 'ok'
  const hasPhoto = !!vehicle.photo_url
  const subtitle = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')

  const mileageText = vehicle.mileage != null
    ? `${vehicle.mileage.toLocaleString()} mi`
    : vehicle.engine_hours != null
    ? `${vehicle.engine_hours.toLocaleString()} hrs`
    : null

  const sc = {
    overdue:  { label: 'Overdue',    dot: 'bg-danger',  text: 'text-danger',  border: 'border-danger/40' },
    due_soon: { label: 'Due Soon',   dot: 'bg-warning', text: 'text-warning', border: 'border-warning/35' },
    ok:       { label: 'Up to Date', dot: 'bg-success', text: 'text-success/80', border: 'border-border/60' },
  }[worstStatus]

  return (
    <Link
      href={`/garage/${vehicle.id}`}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
    >
      <article className={cn(
        'relative bg-card rounded-xl overflow-hidden border transition-all duration-150',
        'group-hover:shadow-lg group-hover:shadow-black/30 group-hover:-translate-y-px',
        hasUrgent ? sc.border : 'border-border/60 group-hover:border-border',
      )}>
        {/* 2px status accent at top */}
        {hasUrgent && (
          <div className={cn(
            'absolute top-0 inset-x-0 h-[2px] z-10',
            worstStatus === 'overdue' ? 'bg-danger' : 'bg-warning'
          )} />
        )}

        {/* Photo — rendered only when a photo exists */}
        {hasPhoto && (
          <div className="relative h-[144px] overflow-hidden">
            <Image
              src={vehicle.photo_url!}
              alt={vehicle.name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
            {/* Gradient scrim for readability */}
            <div className="absolute bottom-0 inset-x-0 h-10 bg-gradient-to-t from-black/50 to-transparent" />
            {/* Status badge on photo */}
            {hasUrgent && (
              <div className={cn(
                'absolute top-2.5 right-2.5 inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded border backdrop-blur-sm',
                worstStatus === 'overdue'
                  ? 'bg-black/60 text-danger border-danger/40'
                  : 'bg-black/60 text-warning border-warning/35'
              )}>
                <span className={cn('w-1.5 h-1.5 rounded-full inline-block', sc.dot)} />
                {sc.label}
              </div>
            )}
          </div>
        )}

        {/* Information panel */}
        <div className={cn(
          'flex flex-col px-4',
          hasPhoto ? 'pt-3 pb-3.5' : 'pt-4 pb-4 min-h-[108px]'
        )}>
          {/* Identity */}
          <div className="flex items-start justify-between gap-2.5 flex-1">
            <div className="min-w-0">
              <h3 className="text-[15px] font-bold text-foreground leading-snug truncate">
                {vehicle.name}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {subtitle || typeLabel}
              </p>
            </div>
            {subtitle && (
              <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wide shrink-0 mt-0.5">
                {typeLabel}
              </span>
            )}
          </div>

          {/* Mileage + status */}
          <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-border/40">
            <span className="text-xs text-muted-foreground tabular-nums">
              {mileageText ?? 'No mileage recorded'}
            </span>
            {hasReminders && (
              <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-medium', sc.text)}>
                <span className={cn('w-1.5 h-1.5 rounded-full inline-block shrink-0', sc.dot)} />
                {sc.label}
              </span>
            )}
          </div>
        </div>
      </article>
    </Link>
  )
}
