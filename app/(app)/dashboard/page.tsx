export const instant = false

import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { GarageGrid } from '@/components/garage/garage-grid'
import { AddVehicleDialog } from '@/components/garage/add-vehicle-dialog'
import { getReminderStatus, type Reminder, type Vehicle } from '@/types'
import { formatDateOnly } from '@/lib/utils'
import { AlertTriangle, Clock } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let { data: garage } = await supabase
    .from('garages')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!garage) {
    const { data: newGarage } = await supabase
      .from('garages')
      .insert({ user_id: user.id, name: 'My Garage' })
      .select()
      .single()
    garage = newGarage
  }

  if (!garage) return <div>Error loading garage</div>

  const { data: vehicles = [] } = await supabase
    .from('vehicles')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  const { data: allReminders = [] } = await supabase
    .from('reminders')
    .select('*')
    .in('vehicle_id', (vehicles || []).map((v: Vehicle) => v.id))
    .eq('is_active', true)

  const remindersByVehicle = (allReminders || []).reduce<Record<string, Reminder[]>>((acc, r) => {
    if (!acc[r.vehicle_id]) acc[r.vehicle_id] = []
    acc[r.vehicle_id].push(r)
    return acc
  }, {})

  await connection()

  const STATUS_RANK = { ok: 0, approaching: 1, due: 2, overdue: 3 } as const
  const urgentReminders = (allReminders || [])
    .map((r: Reminder) => {
      const vehicle = (vehicles || []).find((v: Vehicle) => v.id === r.vehicle_id)
      const status = getReminderStatus(r, vehicle?.mileage, vehicle?.engine_hours)
      return { ...r, status, vehicle }
    })
    .filter(r => r.status !== 'ok')
    .sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status])

  const overdueCount = urgentReminders.filter(r => r.status === 'overdue' || r.status === 'due').length
  const dueSoonCount = urgentReminders.filter(r => r.status === 'approaching').length
  const itemCount = (vehicles || []).length

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">My Garage</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Everything you own. Everything you need to maintain.
          </p>
        </div>
        <div className="shrink-0">
          <AddVehicleDialog garageId={garage.id} userId={user.id} />
        </div>
      </div>

      {/* Metrics strip */}
      {itemCount > 0 && (
        <div className="bg-card border border-border/70 rounded-xl grid grid-cols-3 divide-x divide-border/60 overflow-hidden">
          <div className="px-4 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-primary/70">Garage Items</p>
            <p className="text-2xl font-bold text-foreground tabular-nums mt-1">{itemCount}</p>
          </div>
          <div className={cn('px-4 py-4 transition-colors', overdueCount > 0 && 'bg-danger/[0.06]')}>
            <p className={cn(
              'text-[10px] font-semibold uppercase tracking-widest',
              overdueCount > 0 ? 'text-danger/80' : 'text-muted-foreground'
            )}>Overdue</p>
            <p className={cn(
              'text-2xl font-bold tabular-nums mt-1',
              overdueCount > 0 ? 'text-danger' : 'text-foreground'
            )}>{overdueCount}</p>
          </div>
          <div className={cn('px-4 py-4 transition-colors', dueSoonCount > 0 && 'bg-warning/[0.06]')}>
            <p className={cn(
              'text-[10px] font-semibold uppercase tracking-widest',
              dueSoonCount > 0 ? 'text-warning/80' : 'text-muted-foreground'
            )}>Due Soon</p>
            <p className={cn(
              'text-2xl font-bold tabular-nums mt-1',
              dueSoonCount > 0 ? 'text-warning' : 'text-foreground'
            )}>{dueSoonCount}</p>
          </div>
        </div>
      )}

      {/* Needs attention */}
      {urgentReminders.length > 0 && (
        <div className="border border-border/70 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60 bg-secondary/40">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Needs Attention
            </span>
            <span className={cn(
              'text-[11px] font-semibold',
              overdueCount > 0 ? 'text-danger' : 'text-warning'
            )}>
              {urgentReminders.length} item{urgentReminders.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="divide-y divide-border/50">
            {urgentReminders.slice(0, 5).map((reminder) => (
              <Link
                key={reminder.id}
                href={`/garage/${reminder.vehicle_id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-secondary/30 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={cn(
                    'w-1.5 h-1.5 rounded-full shrink-0',
                    reminder.status === 'overdue' || reminder.status === 'due' ? 'bg-danger' : 'bg-warning'
                  )} />
                  <div className="min-w-0">
                    <span className="text-sm font-medium truncate block">{reminder.service_type}</span>
                    <span className="text-xs text-muted-foreground truncate block">{reminder.vehicle?.name}</span>
                  </div>
                </div>
                <div className="shrink-0">
                  {reminder.next_due_date && (
                    <span className={cn(
                      'text-xs font-medium tabular-nums',
                      reminder.status === 'overdue' || reminder.status === 'due' ? 'text-danger' : 'text-warning'
                    )}>
                      {reminder.status === 'overdue' ? 'Overdue' : reminder.status === 'due' ? 'Due Now' : 'Due'}{' '}
                      {formatDateOnly(reminder.next_due_date, { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                  {reminder.next_due_mileage != null && !reminder.next_due_date && (
                    <span className={cn(
                      'text-xs font-medium tabular-nums',
                      reminder.status === 'overdue' || reminder.status === 'due' ? 'text-danger' : 'text-warning'
                    )}>
                      at {reminder.next_due_mileage.toLocaleString()} mi
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Garage grid */}
      {itemCount > 0 ? (
        <GarageGrid vehicles={vehicles || []} remindersByVehicle={remindersByVehicle} />
      ) : (
        <div className="border border-dashed border-border/50 rounded-xl px-8 py-14 text-center">
          <p className="text-sm font-semibold text-foreground">No items yet</p>
          <p className="text-xs text-muted-foreground mt-1.5">
            Add your first item to start tracking maintenance.
          </p>
        </div>
      )}
    </div>
  )
}
