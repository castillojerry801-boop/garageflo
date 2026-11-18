import Link from 'next/link'
import { VehicleImage } from '@/components/garage/vehicle-image'
import { Vehicle, Reminder, getReminderStatus, VEHICLE_TYPE_LABELS, type ReminderStatus } from '@/types'
import { cn } from '@/lib/utils'

interface VehicleCardProps {
  vehicle: Vehicle
  reminders?: Reminder[]
  isRearranging?: boolean
}

export function VehicleCard({ vehicle, reminders = [], isRearranging = false }: VehicleCardProps) {
  const typeLabel = VEHICLE_TYPE_LABELS[vehicle.type] || 'Vehicle'

  const STATUS_RANK: Record<ReminderStatus, number> = { ok: 0, approaching: 1, due: 2, overdue: 3 }
  const worstStatus = reminders.reduce<ReminderStatus>((worst, r) => {
    const s = getReminderStatus(r, vehicle.mileage, vehicle.engine_hours)
    return STATUS_RANK[s] > STATUS_RANK[worst] ? s : worst
  }, 'ok')

  const hasReminders = reminders.length > 0
  const hasUrgent = hasReminders && worstStatus !== 'ok'
  const subtitle = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')

  const mileageText =
    vehicle.tracking_method === 'date'
      ? 'Date-based'
      : vehicle.mileage != null
      ? `${vehicle.mileage.toLocaleString()} mi`
      : vehicle.engine_hours != null
      ? `${vehicle.engine_hours.toLocaleString()} hrs`
      : null

  const ss = {
    overdue:    { label: 'Overdue',  pillCls: 'bg-danger text-white',    dot: 'bg-danger',   border: 'border-danger/40' },
    due:        { label: 'Due Now',  pillCls: 'bg-danger text-white',    dot: 'bg-danger',   border: 'border-danger/40' },
    approaching:{ label: 'Due Soon', pillCls: 'bg-warning text-black',   dot: 'bg-warning',  border: 'border-warning/35' },
    ok:         { label: 'OK',       pillCls: 'bg-success/80 text-black', dot: 'bg-success', border: 'border-border/60' },
  }[worstStatus]

  const cardEl = (
    <article
      className={cn(
        'relative bg-card rounded-2xl overflow-hidden border transition-all duration-200',
        !isRearranging && 'group-hover:shadow-2xl group-hover:shadow-black/50 group-hover:-translate-y-1',
        hasUrgent ? ss.border : 'border-border/60 group-hover:border-border',
      )}
    >
      {/* Vehicle image hero */}
      <div className="relative h-48 overflow-hidden">
        <VehicleImage
          photoUrl={vehicle.photo_url}
          type={vehicle.type}
          name={vehicle.name}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          imageClassName={!isRearranging ? 'transition-transform duration-500 group-hover:scale-[1.04]' : undefined}
        />

        {/* Bottom scrim */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.25) 50%, transparent 100%)' }}
        />

        {/* Top badges */}
        <div className="absolute top-0 inset-x-0 flex items-start justify-between p-3 pointer-events-none">
          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-lg bg-black/35 text-white/55 backdrop-blur-sm leading-none">
            {typeLabel}
          </span>
          {hasUrgent && (
            <span className={cn('text-[11px] font-bold px-2.5 py-1 rounded-lg leading-none shadow-sm', ss.pillCls)}>
              {ss.label}
            </span>
          )}
        </div>

        {/* Bottom identity */}
        <div className="absolute bottom-0 inset-x-0 px-4 pb-4 pointer-events-none">
          <h3 className="text-[17px] font-black text-white leading-tight truncate tracking-tight">
            {vehicle.name}
          </h3>
          {subtitle && (
            <p className="text-xs text-white/50 mt-0.5 truncate font-medium">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Info strip */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-border/40 bg-secondary/10">
        <span className="text-xs font-semibold text-muted-foreground tabular-nums">
          {mileageText ?? 'No reading'}
        </span>
        {hasReminders && (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 text-[11px] font-semibold',
              hasUrgent
                ? worstStatus === 'approaching'
                  ? 'text-warning'
                  : 'text-danger'
                : 'text-success/70',
            )}
          >
            <span className={cn('w-1.5 h-1.5 rounded-full inline-block shrink-0', ss.dot)} />
            {reminders.length} reminder{reminders.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </article>
  )

  if (isRearranging) return cardEl

  return (
    <Link
      href={`/garage/${vehicle.id}`}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-2xl"
    >
      {cardEl}
    </Link>
  )
}
