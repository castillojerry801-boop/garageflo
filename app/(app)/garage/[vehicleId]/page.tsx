export const instant = false

import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LogForm } from '@/components/maintenance/log-form'
import { ReminderForm } from '@/components/reminders/reminder-form'
import { AttachmentsTab } from '@/components/garage/attachments-tab'
import { RemindersTab } from '@/components/reminders/reminders-tab'
import { getReminderStatus, VEHICLE_TYPE_LABELS, type MaintenanceLog, type Reminder, type ReminderStatus } from '@/types'
import { formatDateOnly } from '@/lib/utils'
import { ArrowLeft, Wrench, Bell, Paperclip, AlertTriangle, Clock, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { DeleteVehicleButton } from '@/components/garage/delete-vehicle-button'
import { EditVehicleDialog } from '@/components/garage/edit-vehicle-dialog'
import { EditLogDialog } from '@/components/maintenance/edit-log-dialog'
import { DeleteLogButton } from '@/components/maintenance/delete-log-button'

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

  const typeLabel = VEHICLE_TYPE_LABELS[vehicle.type as keyof typeof VEHICLE_TYPE_LABELS] || 'Vehicle'

  await connection()

  const STATUS_RANK: Record<ReminderStatus, number> = { ok: 0, approaching: 1, due: 2, overdue: 3 }
  const worstStatus = (reminders || []).reduce<ReminderStatus>((worst, r: Reminder) => {
    const s = getReminderStatus(r, vehicle.mileage, vehicle.engine_hours)
    return STATUS_RANK[s] > STATUS_RANK[worst] ? s : worst
  }, 'ok')

  const totalCost = (logs || []).reduce((sum: number, log: MaintenanceLog) => sum + (log.cost || 0), 0)
  const urgentCount = (reminders || []).filter((r: Reminder) => getReminderStatus(r, vehicle.mileage, vehicle.engine_hours) !== 'ok').length
  const subtitle = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')

  const StatusIcon = worstStatus === 'overdue' || worstStatus === 'due'
    ? AlertTriangle
    : worstStatus === 'approaching'
    ? Clock
    : CheckCircle
  const statusLabel = worstStatus === 'overdue'
    ? 'Overdue'
    : worstStatus === 'due'
    ? 'Due Now'
    : worstStatus === 'approaching'
    ? 'Approaching'
    : 'Up to Date'
  const statusChipClass = {
    overdue:    'bg-danger/10 text-danger border-danger/30',
    due:        'bg-danger/10 text-danger border-danger/30',
    approaching:'bg-warning/10 text-warning border-warning/30',
    ok:         'bg-success/10 text-success border-success/25',
  }[worstStatus]

  const mileageText = vehicle.mileage != null
    ? `${vehicle.mileage.toLocaleString()} mi`
    : vehicle.engine_hours != null
    ? `${vehicle.engine_hours.toLocaleString()} hrs`
    : null

  return (
    <div className="space-y-5 max-w-3xl mx-auto">

      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        My Garage
      </Link>

      {/* Vehicle header */}
      {vehicle.photo_url ? (
        /* Photo hero */
        <div className="relative rounded-xl overflow-hidden h-52 border border-border/70">
          <Image src={vehicle.photo_url} alt={vehicle.name} fill className="object-cover" />
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.15) 55%, transparent 100%)' }}
          />
          <div className="absolute bottom-0 left-0 right-0 px-5 pb-5 pt-10">
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-white/50">{typeLabel}</span>
                </div>
                <h1 className="text-xl font-bold text-white mt-0.5 truncate">{vehicle.name}</h1>
                {subtitle && <p className="text-sm text-white/60 mt-0.5 truncate">{subtitle}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {(reminders || []).length > 0 && (
                  <span className={cn('inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded border backdrop-blur-sm', statusChipClass)}>
                    <StatusIcon className="h-3 w-3" />
                    {statusLabel}
                  </span>
                )}
                <EditVehicleDialog vehicle={vehicle} />
                <DeleteVehicleButton vehicleId={vehicle.id} vehicleName={vehicle.name} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Compact profile header */
        <div className="bg-card border border-border/70 rounded-xl px-5 py-4 flex items-center gap-4">
          <div className="shrink-0 h-10 w-10 rounded-lg bg-secondary/60 border border-border/50 flex items-center justify-center">
            <span className="text-xs font-bold text-muted-foreground/60 uppercase tracking-tight">
              {vehicle.name.trim().split(/\s+/).map((w: string) => w[0]).filter(Boolean).join('').slice(0, 2)}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base font-bold text-foreground truncate">{vehicle.name}</h1>
              <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wide shrink-0">{typeLabel}</span>
              {(reminders || []).length > 0 && (
                <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded border shrink-0', statusChipClass)}>
                  <StatusIcon className="h-2.5 w-2.5" />
                  {statusLabel}
                </span>
              )}
            </div>
            {subtitle && <p className="text-sm text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
            {mileageText && <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">{mileageText}</p>}
          </div>
          <div className="shrink-0 flex items-center gap-1">
            <EditVehicleDialog vehicle={vehicle} />
            <DeleteVehicleButton vehicleId={vehicle.id} vehicleName={vehicle.name} />
          </div>
        </div>
      )}

      {/* Stats strip */}
      <div className="bg-card border border-border/70 rounded-xl grid grid-cols-3 divide-x divide-border/60 overflow-hidden">
        <div className="px-4 py-4 text-center">
          <p className="text-xl font-bold text-foreground tabular-nums">{(logs || []).length}</p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mt-0.5">Services</p>
        </div>
        <div className="px-4 py-4 text-center">
          <p className="text-xl font-bold text-foreground tabular-nums">
            {vehicle.mileage != null
              ? vehicle.mileage.toLocaleString()
              : vehicle.engine_hours != null
              ? vehicle.engine_hours.toLocaleString()
              : '—'}
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mt-0.5">
            {vehicle.engine_hours != null && vehicle.mileage == null ? 'Hours' : 'Miles'}
          </p>
        </div>
        <div className="px-4 py-4 text-center">
          <p className="text-xl font-bold text-foreground tabular-nums">
            ${totalCost > 0 ? totalCost.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '0'}
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mt-0.5">Spent</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="history" className="space-y-5">
        <TabsList className="bg-card border border-border/70 p-1 rounded-xl w-full grid grid-cols-3 h-auto">
          <TabsTrigger
            value="history"
            className="rounded-lg py-2 text-sm font-medium text-muted-foreground data-active:bg-primary/15 data-active:text-primary transition-all"
          >
            <Wrench className="h-3.5 w-3.5 mr-1.5 shrink-0" />
            History
          </TabsTrigger>
          <TabsTrigger
            value="reminders"
            className="rounded-lg py-2 text-sm font-medium text-muted-foreground data-active:bg-primary/15 data-active:text-primary transition-all"
          >
            <Bell className="h-3.5 w-3.5 mr-1.5 shrink-0" />
            Reminders
            {urgentCount > 0 && (
              <span className="ml-1.5 bg-warning text-black text-[10px] rounded px-1 inline-flex items-center justify-center font-bold leading-none shrink-0 h-4">
                {urgentCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="documents"
            className="rounded-lg py-2 text-sm font-medium text-muted-foreground data-active:bg-primary/15 data-active:text-primary transition-all"
          >
            <Paperclip className="h-3.5 w-3.5 mr-1.5 shrink-0" />
            Docs
          </TabsTrigger>
        </TabsList>

        {/* Maintenance History */}
        <TabsContent value="history" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Service History</h2>
              {(logs || []).length > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {(logs || []).length} record{(logs || []).length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            <LogForm vehicleId={vehicle.id} reminders={reminders || []} trackingMethod={vehicle.tracking_method} currentMileage={vehicle.mileage} currentHours={vehicle.engine_hours} />
          </div>

          {(logs || []).length === 0 ? (
            <div className="text-center py-12 border border-dashed border-border/50 rounded-xl">
              <p className="text-sm font-medium text-muted-foreground">No service records yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Log your first service to get started</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(logs || []).map((log: MaintenanceLog) => (
                <div
                  key={log.id}
                  className="bg-card border border-border/70 rounded-xl px-4 py-3.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-foreground leading-snug">{log.service_type}</p>
                    <div className="flex items-center gap-1 shrink-0">
                      {log.cost != null && (
                        <span className="text-sm font-semibold text-foreground tabular-nums mr-1">
                          ${log.cost.toFixed(2)}
                        </span>
                      )}
                      <EditLogDialog log={log} />
                      <DeleteLogButton logId={log.id} serviceType={log.service_type} />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                    {formatDateOnly(log.performed_at)}
                    {log.mileage_at_service != null && ` · ${log.mileage_at_service.toLocaleString()} mi`}
                    {log.hours_at_service != null && ` · ${log.hours_at_service} hrs`}
                  </p>
                  {log.notes && (
                    <p className="text-xs text-muted-foreground/70 mt-2 leading-relaxed">{log.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Reminders */}
        <TabsContent value="reminders" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Maintenance Reminders</h2>
              {(reminders || []).length > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">{(reminders || []).length} active</p>
              )}
            </div>
            <ReminderForm vehicleId={vehicle.id} />
          </div>
          <RemindersTab
            reminders={reminders || []}
            currentMileage={vehicle.mileage}
            currentHours={vehicle.engine_hours}
            vehicleId={vehicle.id}
          />
        </TabsContent>

        {/* Documents */}
        <TabsContent value="documents" className="space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Documents & Photos</h2>
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
