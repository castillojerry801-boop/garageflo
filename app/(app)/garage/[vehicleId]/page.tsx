export const instant = false

import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LogForm } from '@/components/maintenance/log-form'
import { ReminderForm } from '@/components/reminders/reminder-form'
import { AttachmentsTab } from '@/components/garage/attachments-tab'
import { RemindersTab } from '@/components/reminders/reminders-tab'
import { getReminderStatus, VEHICLE_TYPE_EMOJI, VEHICLE_TYPE_LABELS, type MaintenanceLog, type Reminder } from '@/types'
import { ArrowLeft, Wrench, Bell, Paperclip, AlertTriangle, Clock, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { DeleteVehicleButton } from '@/components/garage/delete-vehicle-button'

export default async function VehiclePage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('*')
    .eq('id', vehicleId)
    .eq('user_id', user.id)
    .single()

  if (!vehicle) notFound()

  const [{ data: logs = [] }, { data: reminders = [] }, { data: attachments = [] }] = await Promise.all([
    supabase.from('maintenance_logs').select('*').eq('vehicle_id', vehicleId).order('performed_at', { ascending: false }),
    supabase.from('reminders').select('*').eq('vehicle_id', vehicleId).eq('is_active', true).order('created_at', { ascending: false }),
    supabase.from('attachments').select('*').eq('vehicle_id', vehicleId).order('created_at', { ascending: false }),
  ])

  const emoji = VEHICLE_TYPE_EMOJI[vehicle.type as keyof typeof VEHICLE_TYPE_EMOJI] || '🔧'
  const typeLabel = VEHICLE_TYPE_LABELS[vehicle.type as keyof typeof VEHICLE_TYPE_LABELS] || 'Vehicle'

  const worstStatus = (reminders || []).reduce<'overdue' | 'due_soon' | 'ok'>((worst, reminder: Reminder) => {
    const status = getReminderStatus(reminder, vehicle.mileage)
    if (status === 'overdue') return 'overdue'
    if (status === 'due_soon' && worst !== 'overdue') return 'due_soon'
    return worst
  }, 'ok')

  const totalCost = (logs || []).reduce((sum: number, log: MaintenanceLog) => sum + (log.cost || 0), 0)

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Back button */}
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Back to Garage
      </Link>

      {/* Vehicle hero */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="relative h-48 bg-secondary/50 flex items-center justify-center">
          {vehicle.photo_url ? (
            <Image src={vehicle.photo_url} alt={vehicle.name} fill className="object-cover" />
          ) : (
            <span className="text-8xl opacity-40">{emoji}</span>
          )}
        </div>
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-black">{vehicle.name}</h1>
              <p className="text-muted-foreground">
                {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || typeLabel}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {(reminders || []).length > 0 && (
                <Badge className={cn(
                  'font-semibold border',
                  worstStatus === 'overdue' ? 'bg-danger/15 text-danger border-danger/30' :
                  worstStatus === 'due_soon' ? 'bg-warning/15 text-warning border-warning/30' :
                  'bg-success/15 text-success border-success/30'
                )}>
                  {worstStatus === 'overdue' && <AlertTriangle className="h-3 w-3 mr-1" />}
                  {worstStatus === 'due_soon' && <Clock className="h-3 w-3 mr-1" />}
                  {worstStatus === 'ok' && <CheckCircle className="h-3 w-3 mr-1" />}
                  {worstStatus === 'overdue' ? 'Overdue' : worstStatus === 'due_soon' ? 'Due Soon' : 'Up to Date'}
                </Badge>
              )}
              <DeleteVehicleButton vehicleId={vehicle.id} vehicleName={vehicle.name} />
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3 mt-6">
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-primary">{(logs || []).length}</p>
              <p className="text-xs text-muted-foreground">Services</p>
            </div>
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-primary">
                {vehicle.mileage ? vehicle.mileage.toLocaleString() : '—'}
              </p>
              <p className="text-xs text-muted-foreground">Miles</p>
            </div>
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-primary">
                ${totalCost > 0 ? totalCost.toFixed(0) : '0'}
              </p>
              <p className="text-xs text-muted-foreground">Total Spent</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="history" className="space-y-4">
        <TabsList className="bg-card border border-border p-1 rounded-xl w-full grid grid-cols-3">
          <TabsTrigger value="history" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-semibold">
            <Wrench className="h-4 w-4 mr-1.5" />
            History
          </TabsTrigger>
          <TabsTrigger value="reminders" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-semibold">
            <Bell className="h-4 w-4 mr-1.5" />
            Reminders
            {(reminders || []).filter((r: Reminder) => getReminderStatus(r, vehicle.mileage) !== 'ok').length > 0 && (
              <span className="ml-1.5 bg-warning text-warning-foreground text-xs rounded-full px-1.5 py-0.5 font-bold leading-none">
                {(reminders || []).filter((r: Reminder) => getReminderStatus(r, vehicle.mileage) !== 'ok').length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="documents" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-semibold">
            <Paperclip className="h-4 w-4 mr-1.5" />
            Docs
          </TabsTrigger>
        </TabsList>

        {/* Maintenance History */}
        <TabsContent value="history" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-lg">Service History</h2>
            <LogForm vehicleId={vehicle.id} />
          </div>

          {(logs || []).length === 0 ? (
            <div className="text-center py-12 bg-card border border-dashed border-border rounded-2xl">
              <Wrench className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-muted-foreground font-medium">No service records yet</p>
              <p className="text-sm text-muted-foreground">Log your first service to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(logs || []).map((log: MaintenanceLog) => (
                <div key={log.id} className="bg-card border border-border rounded-xl p-4 flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Wrench className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{log.service_type}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(log.performed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {log.mileage_at_service ? ` · ${log.mileage_at_service.toLocaleString()} mi` : ''}
                      </p>
                      {log.notes && <p className="text-xs text-muted-foreground mt-1 truncate">{log.notes}</p>}
                    </div>
                  </div>
                  {log.cost && (
                    <span className="text-sm font-bold text-primary shrink-0">${log.cost.toFixed(2)}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Reminders */}
        <TabsContent value="reminders" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-lg">Reminders</h2>
            <ReminderForm vehicleId={vehicle.id} />
          </div>
          <RemindersTab reminders={reminders || []} currentMileage={vehicle.mileage} vehicleId={vehicle.id} />
        </TabsContent>

        {/* Documents */}
        <TabsContent value="documents" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-lg">Documents & Photos</h2>
          </div>
          <AttachmentsTab
            vehicleId={vehicle.id}
            userId={user.id}
            attachments={attachments || []}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
