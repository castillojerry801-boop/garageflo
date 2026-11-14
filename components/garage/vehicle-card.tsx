import Link from 'next/link'
import Image from 'next/image'
import { Vehicle, Reminder, getReminderStatus, VEHICLE_TYPE_EMOJI, VEHICLE_TYPE_LABELS } from '@/types'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Clock, CheckCircle, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VehicleCardProps {
  vehicle: Vehicle
  reminders?: Reminder[]
}

export function VehicleCard({ vehicle, reminders = [] }: VehicleCardProps) {
  const emoji = VEHICLE_TYPE_EMOJI[vehicle.type] || '🔧'
  const typeLabel = VEHICLE_TYPE_LABELS[vehicle.type] || 'Vehicle'

  const worstStatus = reminders.reduce<'overdue' | 'due_soon' | 'ok'>((worst, reminder) => {
    const status = getReminderStatus(reminder, vehicle.mileage)
    if (status === 'overdue') return 'overdue'
    if (status === 'due_soon' && worst !== 'overdue') return 'due_soon'
    return worst
  }, 'ok')

  const statusConfig = {
    overdue: { label: 'Overdue', icon: AlertTriangle, className: 'bg-danger/15 text-danger border-danger/30' },
    due_soon: { label: 'Due Soon', icon: Clock, className: 'bg-warning/15 text-warning border-warning/30' },
    ok: { label: 'Up to Date', icon: CheckCircle, className: 'bg-success/15 text-success border-success/30' },
  }

  const status = reminders.length > 0 ? statusConfig[worstStatus] : null
  const StatusIcon = status?.icon

  return (
    <Link href={`/garage/${vehicle.id}`}>
      <div className={cn(
        'group relative bg-card border border-border rounded-2xl overflow-hidden transition-all duration-200',
        'hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5',
        worstStatus === 'overdue' && 'border-danger/30',
        worstStatus === 'due_soon' && 'border-warning/30',
      )}>
        {/* Vehicle photo or placeholder */}
        <div className="relative h-32 bg-secondary/50 flex items-center justify-center overflow-hidden">
          {vehicle.photo_url ? (
            <Image
              src={vehicle.photo_url}
              alt={vehicle.name}
              fill
              className="object-cover"
            />
          ) : (
            <span className="text-5xl opacity-60">{emoji}</span>
          )}
          {status && (
            <div className={cn('absolute top-2 right-2 flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border', status.className)}>
              {StatusIcon && <StatusIcon className="h-3 w-3" />}
              {status.label}
            </div>
          )}
        </div>

        {/* Vehicle info */}
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-bold text-foreground truncate leading-tight">{vehicle.name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || typeLabel}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5 group-hover:text-primary transition-colors" />
          </div>

          {vehicle.mileage && (
            <p className="text-xs text-muted-foreground mt-2">
              {vehicle.mileage.toLocaleString()} mi
            </p>
          )}

          {reminders.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {reminders.length} reminder{reminders.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>
    </Link>
  )
}
