export const instant = false

import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LogForm } from '@/components/maintenance/log-form'
import { ReminderForm } from '@/components/reminders/reminder-form'
import { AttachmentsTab } from '@/components/garage/attachments-tab'
import { RemindersTab } from '@/components/reminders/reminders-tab'
import { VehicleImage } from '@/components/garage/vehicle-image'
import { VehiclePhotoEditor } from '@/components/garage/vehicle-photo-editor'
import {
  getReminderStatus,
  VEHICLE_TYPE_LABELS,
  type MaintenanceLog,
  type Reminder,
  type ReminderStatus,
  type VehicleType,
} from '@/types'
import { formatDateOnly } from '@/lib/utils'
import { ArrowLeft, Wrench, Bell, Paperclip, ShieldAlert, AlertTriangle, Clock, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { DeleteVehicleButton } from '@/components/garage/delete-vehicle-button'
import { EditVehicleDialog } from '@/components/garage/edit-vehicle-dialog'
import { EditLogDialog } from '@/components/maintenance/edit-log-dialog'
import { DeleteLogButton } from '@/components/maintenance/delete-log-button'
import { RecallsTab } from '@/components/garage/recalls-tab'

export default async function VehiclePage({ params }: { params: Promise<{ vehicleId: string }> }) {
  await connection()
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

  // Resolve signed URL for the user-uploaded hero photo (private bucket).
  // Falls back to null (gradient fallback) if no photo or signing fails.
  let resolvedPhotoUrl: string | null = null
  if (vehicle.photo_url) {
    const { data: signedData } = await supabase.storage
      .from('vehicle-photos')
      .createSignedUrl(vehicle.photo_url, 86400)
    resolvedPhotoUrl = signedData?.signedUrl ?? null
  }

  const [{ data: logs = [] }, { data: reminders = [] }, { data: attachments = [] }] = await Promise.all([
    supabase.from('maintenance_logs').select('*').eq('vehicle_id', vehicleId).order('performed_at', { ascending: false }),
    supabase.from('reminders').select('*').eq('vehicle_id', vehicleId).eq('is_active', true).order('created_at', { ascending: false }),
    supabase.from('attachments').select('*').eq('vehicle_id', vehicleId).order('created_at', { ascending: false }),
  ])

  const typeLabel = VEHICLE_TYPE_LABELS[vehicle.type as keyof typeof VEHICLE_TYPE_LABELS] || 'Vehicle'

  const STATUS_RANK: Record<ReminderStatus, number> = { ok: 0, approaching: 1, due: 2, overdue: 3 }
  const worstStatus = (reminders || []).reduce<ReminderStatus>((worst, r: Reminder) => {
    const s = getReminderStatus(r, vehicle.mileage, vehicle.engine_hours)
    return STATUS_RANK[s] > STATUS_RANK[worst] ? s : worst
  }, 'ok')

  const totalCost = (logs || []).reduce((sum: number, log: MaintenanceLog) => sum + (log.cost || 0), 0)
  const urgentCount = (reminders || []).filter((r: Reminder) => getReminderStatus(r, vehicle.mileage, vehicle.engine_hours) !== 'ok').length
  const subtitle = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')

  const StatusIcon =
    worstStatus === 'overdue' || worstStatus === 'due'
      ? AlertTriangle
      : worstStatus === 'approaching'
      ? Clock
      : CheckCircle

  const statusLabel =
    worstStatus === 'overdue' ? 'Overdue' :
    worstStatus === 'due' ? 'Due Now' :
    worstStatus === 'approaching' ? 'Approaching' :
    'Up to Date'

  const statusChipClass = {
    overdue:    'bg-danger text-white',
    due:        'bg-danger text-white',
    approaching:'bg-warning text-black',
    ok:         'bg-success/80 text-black',
  }[worstStatus]

  const mileageText =
    vehicle.mileage != null
      ? `${vehicle.mileage.toLocaleString()} mi`
      : vehicle.engine_hours != null
      ? `${vehicle.engine_hours.toLocaleString()} hrs`
      : null

  return (
    <div className="space-y-5 max-w-3xl mx-auto">

      {/* ── Vehicle hero ─────────────────────────────────────────────── */}
      <div className="relative rounded-2xl overflow-hidden h-64 sm:h-80 border border-border/50 shadow-2xl shadow-black/40">
        <VehicleImage
          photoUrl={resolvedPhotoUrl}
          type={vehicle.type as VehicleType}
          name={vehicle.name}
          fill
          priority
          sizes="(max-width: 768px) 100vw, 768px"
        />

        {/* Top gradient scrim */}
        <div className="absolute top-0 inset-x-0 h-28 bg-gradient-to-b from-black/75 to-transparent pointer-events-none" />

        {/* Bottom gradient scrim */}
        <div
          className="absolute bottom-0 inset-x-0 pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.55) 42%, transparent 100%)' }}
        />

        {/* Top row: back link + edit / delete */}
        <div className="absolute top-0 inset-x-0 flex items-center justify-between px-4 py-3 sm:py-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white/75 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>My Garage</span>
          </Link>
          <div className="flex items-center gap-1.5">
            <VehiclePhotoEditor vehicleId={vehicle.id} userId={user.id} hasPhoto={!!vehicle.photo_url} />
            <EditVehicleDialog vehicle={vehicle} />
            <DeleteVehicleButton vehicleId={vehicle.id} vehicleName={vehicle.name} photoUrl={vehicle.photo_url ?? null} />
          </div>
        </div>

        {/* Bottom identity */}
        <div className="absolute bottom-0 inset-x-0 px-5 pb-5 pointer-events-none">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/45">{typeLabel}</span>
            {(reminders || []).length > 0 && (
              <span className={cn('inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg', statusChipClass)}>
                <StatusIcon className="h-3 w-3" />
                {statusLabel}
              </span>
            )}
          </div>
          {/* Show year/make/model as the primary identity; fall back to custom name */}
          <h1 className="text-2xl sm:text-3xl font-black text-white leading-none tracking-tight truncate">
            {subtitle || vehicle.name}
          </h1>
          {/* Show custom name only when it differs from the subtitle */}
          {subtitle && vehicle.name !== subtitle && (
            <p className="text-sm font-medium text-white/55 mt-0.5 truncate">{vehicle.name}</p>
          )}
          {mileageText && (
            <p className="text-sm font-semibold text-white/65 mt-1.5 tabular-nums">{mileageText}</p>
          )}
        </div>
      </div>

      {/* ── Stats strip ──────────────────────────────────────────────── */}
      <div className="bg-card border border-border/70 rounded-xl grid grid-cols-3 divide-x divide-border/60 overflow-hidden">
        <div className="px-4 py-4 text-center">
          <p className="text-xl font-bold text-foreground tabular-nums">{(logs || []).length}</p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mt-0.5">Services</p>
        </div>
        <div className="px-4 py-4 text-center">
          <p className="text-xl font-bold text-foreground tabular-nums">{(reminders || []).length}</p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mt-0.5">Reminders</p>
        </div>
        <div className="px-4 py-4 text-center">
          <p className="text-xl font-bold text-foreground tabular-nums">
            ${totalCost > 0 ? totalCost.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '0'}
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mt-0.5">Spent</p>
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <Tabs defaultValue="history" className="space-y-5">
        <TabsList className="bg-card border border-border/70 p-1 rounded-xl w-full h-auto flex overflow-x-auto [&::-webkit-scrollbar]:hidden">
          <TabsTrigger
            value="history"
            className="rounded-lg py-2.5 px-3 shrink-0 grow text-xs sm:text-sm font-medium text-muted-foreground data-active:bg-primary/15 data-active:text-primary transition-all whitespace-nowrap"
          >
            <Wrench className="h-3.5 w-3.5 mr-1.5 shrink-0" />
            History
          </TabsTrigger>
          <TabsTrigger
            value="reminders"
            className="rounded-lg py-2.5 px-3 shrink-0 grow text-xs sm:text-sm font-medium text-muted-foreground data-active:bg-primary/15 data-active:text-primary transition-all whitespace-nowrap"
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
            className="rounded-lg py-2.5 px-3 shrink-0 grow text-xs sm:text-sm font-medium text-muted-foreground data-active:bg-primary/15 data-active:text-primary transition-all whitespace-nowrap"
          >
            <Paperclip className="h-3.5 w-3.5 mr-1.5 shrink-0" />
            Docs
          </TabsTrigger>
          <TabsTrigger
            value="recalls"
            className="rounded-lg py-2.5 px-3 shrink-0 grow text-xs sm:text-sm font-medium text-muted-foreground data-active:bg-primary/15 data-active:text-primary transition-all whitespace-nowrap"
          >
            <ShieldAlert className="h-3.5 w-3.5 mr-1.5 shrink-0" />
            Recalls
          </TabsTrigger>
        </TabsList>

        {/* ── Maintenance History ──── */}
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
            <LogForm
              vehicleId={vehicle.id}
              reminders={reminders || []}
              trackingMethod={vehicle.tracking_method}
              currentMileage={vehicle.mileage}
              currentHours={vehicle.engine_hours}
            />
          </div>

          {(logs || []).length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-8 border border-dashed border-border/50 rounded-xl">
              <div className="text-center">
                <p className="text-sm font-medium text-muted-foreground">No service records yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Track mileage, cost, and service notes</p>
              </div>
              <LogForm
                vehicleId={vehicle.id}
                reminders={reminders || []}
                trackingMethod={vehicle.tracking_method}
                currentMileage={vehicle.mileage}
                currentHours={vehicle.engine_hours}
              />
            </div>
          ) : (
            /* Timeline layout */
            <div className="relative">
              {/* Vertical axis — fades out at bottom */}
              <div className="absolute left-5 top-5 bottom-6 w-px bg-gradient-to-b from-border/50 via-border/35 to-transparent" />

              <div className="space-y-3">
                {(logs || []).map((log: MaintenanceLog) => (
                  <div key={log.id} className="relative flex items-start gap-3">
                    {/* Timeline node */}
                    <div className="flex-none w-10 h-10 rounded-full bg-card border border-border/60 flex items-center justify-center z-10 shadow-sm">
                      <Wrench className="w-3.5 h-3.5 text-primary/50" />
                    </div>

                    {/* Log card */}
                    <div className="flex-1 bg-card border border-border/70 rounded-xl px-4 py-3.5 min-w-0 mt-0.5">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold text-foreground leading-snug">{log.service_type}</p>
                        <div className="flex items-center gap-1 shrink-0">
                          {log.cost != null && (
                            <span className="text-sm font-bold text-foreground tabular-nums mr-1">
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
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Reminders ──── */}
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

        {/* ── Documents ──── */}
        <TabsContent value="documents" className="space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Documents & Photos</h2>
          <AttachmentsTab
            vehicleId={vehicle.id}
            userId={user.id}
            attachments={attachments || []}
          />
        </TabsContent>

        {/* ── Safety Recalls ──── */}
        <TabsContent value="recalls" className="space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Safety Recalls</h2>
          <RecallsTab
            vehicleId={vehicle.id}
            vehicleName={vehicle.name}
            vehicleType={vehicle.type as VehicleType}
            make={vehicle.make}
            year={vehicle.year}
            model={vehicle.model}
            vin={vehicle.vin}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
