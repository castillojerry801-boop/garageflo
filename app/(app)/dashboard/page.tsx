export const instant = false

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { VehicleCard } from '@/components/garage/vehicle-card'
import { AddVehicleDialog } from '@/components/garage/add-vehicle-dialog'
import { getReminderStatus, type Reminder, type Vehicle } from '@/types'
import { AlertTriangle, Clock, Wrench } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get or create garage
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

  // Upcoming reminders (overdue or due_soon)
  const urgentReminders = (allReminders || [])
    .map((r: Reminder) => {
      const vehicle = (vehicles || []).find((v: Vehicle) => v.id === r.vehicle_id)
      const status = getReminderStatus(r, vehicle?.mileage)
      return { ...r, status, vehicle }
    })
    .filter((r) => r.status === 'overdue' || r.status === 'due_soon')
    .sort((a, b) => {
      if (a.status === 'overdue' && b.status !== 'overdue') return -1
      if (b.status === 'overdue' && a.status !== 'overdue') return 1
      return 0
    })

  const name = user.user_metadata?.full_name?.split(' ')[0] || 'Driver'

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black tracking-tight">
          Hey, {name} 👋
        </h1>
        <p className="text-muted-foreground mt-1">
          {(vehicles || []).length === 0
            ? "Add your first vehicle to get started."
            : `You have ${(vehicles || []).length} vehicle${(vehicles || []).length !== 1 ? 's' : ''} in your garage.`}
        </p>
      </div>

      {/* Urgent reminders banner */}
      {urgentReminders.length > 0 && (
        <div className="rounded-2xl border border-warning/30 bg-warning/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <h2 className="font-bold text-warning">
              {urgentReminders.filter(r => r.status === 'overdue').length > 0
                ? `${urgentReminders.filter(r => r.status === 'overdue').length} Overdue`
                : ''
              }
              {urgentReminders.filter(r => r.status === 'overdue').length > 0 &&
               urgentReminders.filter(r => r.status === 'due_soon').length > 0 ? ' · ' : ''}
              {urgentReminders.filter(r => r.status === 'due_soon').length > 0
                ? `${urgentReminders.filter(r => r.status === 'due_soon').length} Due Soon`
                : ''
              }
            </h2>
          </div>
          <div className="space-y-2">
            {urgentReminders.slice(0, 5).map((reminder) => (
              <Link
                key={reminder.id}
                href={`/garage/${reminder.vehicle_id}`}
                className="flex items-center justify-between gap-3 rounded-xl bg-card border border-border px-4 py-2.5 hover:border-primary/50 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {reminder.status === 'overdue'
                    ? <AlertTriangle className="h-4 w-4 text-danger shrink-0" />
                    : <Clock className="h-4 w-4 text-warning shrink-0" />
                  }
                  <div className="min-w-0">
                    <span className="text-sm font-semibold truncate block">{reminder.service_type}</span>
                    <span className="text-xs text-muted-foreground truncate block">{reminder.vehicle?.name}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {reminder.next_due_date && (
                    <span className={cn(
                      'text-xs font-medium',
                      reminder.status === 'overdue' ? 'text-danger' : 'text-warning'
                    )}>
                      {reminder.status === 'overdue' ? 'Overdue' : 'Due'} {new Date(reminder.next_due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                  {reminder.next_due_mileage && (
                    <span className={cn(
                      'text-xs font-medium block',
                      reminder.status === 'overdue' ? 'text-danger' : 'text-warning'
                    )}>
                      {reminder.next_due_mileage.toLocaleString()} mi
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Vehicle grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" />
            My Garage
          </h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {(vehicles || []).map((vehicle: Vehicle) => (
            <VehicleCard
              key={vehicle.id}
              vehicle={vehicle}
              reminders={remindersByVehicle[vehicle.id] || []}
            />
          ))}
          <AddVehicleDialog garageId={garage.id} userId={user.id} />
        </div>
      </div>
    </div>
  )
}
