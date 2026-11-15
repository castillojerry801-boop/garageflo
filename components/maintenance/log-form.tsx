'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { type Reminder } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Plus, Loader2, ChevronDown, Bell } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LogFormProps {
  vehicleId: string
  reminders?: Reminder[]
}

const QUICK_SERVICES = [
  'Oil Change',
  'Tire Rotation',
  'Brake Inspection',
  'Air Filter',
  'Spark Plugs',
  'Battery',
  'Annual Inspection',
  'Other',
]

const INTERVAL_PRESETS = [3000, 5000, 7500] as const

export function LogForm({ vehicleId, reminders = [] }: LogFormProps) {
  const router = useRouter()
  const supabase = createClient()
  // Key is generated once per form-open; replaced only on confirmed success.
  // A network timeout with the form still open reuses the same key on retry.
  const idempotencyKeyRef = useRef(crypto.randomUUID())

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showOptional, setShowOptional] = useState(false)
  const [showReminder, setShowReminder] = useState(false)
  const [reminderAction, setReminderAction] = useState<'advance' | 'create'>('create')
  const [intervalPreset, setIntervalPreset] = useState<number | null>(null)
  const [customInterval, setCustomInterval] = useState('')
  const [notifyMilesBefore, setNotifyMilesBefore] = useState('500')
  const [reminderError, setReminderError] = useState('')

  const [form, setForm] = useState({
    service_type: '',
    custom_service: '',
    performed_at: new Date().toISOString().split('T')[0],
    mileage_at_service: '',
    cost: '',
    notes: '',
  })

  const serviceType = form.service_type === 'Other'
    ? form.custom_service.trim()
    : form.service_type

  // Exact-match against active reminders (matches the SQL service_type = p_service_type check).
  const matchingReminder = serviceType
    ? reminders.find(r => r.is_active && r.service_type === serviceType) ?? null
    : null

  function handleChange(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
    setReminderError('')
  }

  function handleServiceTypeSelect(type: string) {
    const resolvedType = type === 'Other' ? '' : type
    setForm(prev => ({ ...prev, service_type: type, custom_service: '' }))
    setReminderError('')

    // Auto-configure reminder mode based on whether a matching reminder exists.
    const match = type !== 'Other'
      ? reminders.find(r => r.is_active && r.service_type === resolvedType) ?? null
      : null

    if (match) {
      setReminderAction('advance')
      setNotifyMilesBefore(match.notify_miles_before?.toString() ?? '500')
      if (match.interval_miles) {
        const isPreset = (INTERVAL_PRESETS as readonly number[]).includes(match.interval_miles)
        if (isPreset) {
          setIntervalPreset(match.interval_miles)
          setCustomInterval('')
        } else {
          setIntervalPreset(null)
          setCustomInterval(match.interval_miles.toString())
        }
      } else {
        setIntervalPreset(null)
        setCustomInterval('')
      }
    } else {
      setReminderAction('create')
      setIntervalPreset(null)
      setCustomInterval('')
    }
  }

  function handleShowReminder() {
    // Auto-expand optional section so the user sees the mileage field.
    if (!showReminder && !form.mileage_at_service) setShowOptional(true)
    setShowReminder(v => !v)
    setReminderError('')
  }

  function getEffectiveInterval(): number | null {
    if (intervalPreset !== null) return intervalPreset
    const parsed = parseInt(customInterval)
    return isNaN(parsed) || parsed <= 0 ? null : parsed
  }

  function handleClose() {
    setOpen(false)
    setShowOptional(false)
    setShowReminder(false)
    setReminderAction('create')
    setIntervalPreset(null)
    setCustomInterval('')
    setNotifyMilesBefore('500')
    setReminderError('')
    setForm({
      service_type: '', custom_service: '',
      performed_at: new Date().toISOString().split('T')[0],
      mileage_at_service: '', cost: '', notes: '',
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setReminderError('')

    if (!serviceType) {
      toast.error('Select or enter a service type')
      return
    }

    const mileageNum = form.mileage_at_service ? parseInt(form.mileage_at_service) : null
    const costNum = form.cost ? parseFloat(form.cost) : null
    const effectiveInterval = showReminder ? getEffectiveInterval() : null

    if (showReminder) {
      if (effectiveInterval === null) {
        toast.error('Enter a valid service interval')
        return
      }
      if (mileageNum === null) {
        setReminderError('Enter a mileage reading above to calculate the next due mileage.')
        setShowOptional(true)
        return
      }
    }

    // Resolve the reminder target. If the user chose 'advance' but the matching
    // reminder no longer exists in the prop (stale state), fall back to 'create'.
    const effectiveAction = showReminder && reminderAction === 'advance' && matchingReminder
      ? 'advance'
      : 'create'
    const reminderIdParam = effectiveAction === 'advance' && matchingReminder
      ? matchingReminder.id
      : null

    setLoading(true)

    const { error } = await supabase.rpc('log_service', {
      p_vehicle_id: vehicleId,
      p_service_type: serviceType,
      p_performed_at: form.performed_at,
      p_mileage_at_service: mileageNum,
      p_cost: costNum,
      p_notes: form.notes.trim() || null,
      p_reminder_id: reminderIdParam,
      p_interval_miles: showReminder ? effectiveInterval : null,
      p_notify_miles_before: showReminder && notifyMilesBefore
        ? parseInt(notifyMilesBefore)
        : null,
      p_idempotency_key: idempotencyKeyRef.current,
    })

    setLoading(false)

    if (error) {
      const msg = error.message ?? ''
      const detail = (error as { details?: string }).details ?? ''

      if (msg.includes('reminder_regression_blocked')) {
        const match = detail.match(/computed=(\d+) current=(\d+)/)
        if (match) {
          setReminderError(
            `This interval would set the next service at ${parseInt(match[1]).toLocaleString()} mi, behind the current schedule at ${parseInt(match[2]).toLocaleString()} mi. Increase the interval or choose a later service date.`
          )
        } else {
          setReminderError(
            'The computed due mileage is behind the current schedule. Increase the interval.'
          )
        }
      } else if (msg.includes('conflicting_reminder_exists')) {
        setReminderError(
          'A reminder for this service already exists. Switch to "Advance existing" to update it, or refresh the page.'
        )
        setReminderAction('advance')
      } else if (msg.includes('reminder_not_found')) {
        setReminderError(
          'The existing reminder was not found — it may have been deleted. Refresh and try again.'
        )
      } else {
        toast.error('Failed to log service')
      }
      return
    }

    // Rotate the idempotency key only on confirmed success.
    idempotencyKeyRef.current = crypto.randomUUID()
    toast.success('Service logged!')
    handleClose()
    router.refresh()
  }

  const previewDue = form.mileage_at_service && getEffectiveInterval() !== null
    ? parseInt(form.mileage_at_service) + getEffectiveInterval()!
    : null

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true) }}>
      <DialogTrigger className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Plus className="h-4 w-4" />
        Log Service
      </DialogTrigger>

      <DialogContent className="bg-card border-border max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Log a Service</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-1">

          {/* Service type — quick chips */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Service Type</Label>
            <div className="flex flex-wrap gap-2">
              {QUICK_SERVICES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleServiceTypeSelect(type)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                    form.service_type === type
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-secondary/50 text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
            {form.service_type === 'Other' && (
              <Input
                placeholder="Describe the service..."
                value={form.custom_service}
                onChange={(e) => handleChange('custom_service', e.target.value)}
                className="bg-input border-border mt-2"
                autoFocus
              />
            )}
          </div>

          {/* Date — always visible */}
          <div className="space-y-1.5">
            <Label htmlFor="lf-performed_at" className="text-sm font-semibold">Date Performed</Label>
            <Input
              id="lf-performed_at"
              type="date"
              value={form.performed_at}
              onChange={(e) => handleChange('performed_at', e.target.value)}
              className="bg-input border-border"
            />
          </div>

          {/* Optional fields — collapsed by default */}
          <div>
            <button
              type="button"
              onClick={() => setShowOptional(v => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showOptional && 'rotate-180')} />
              {showOptional ? 'Hide' : 'Add'} mileage, cost & notes
            </button>

            {showOptional && (
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="lf-mileage" className="text-xs text-muted-foreground">Mileage</Label>
                    <Input
                      id="lf-mileage"
                      type="number"
                      placeholder="45,000"
                      min="0"
                      value={form.mileage_at_service}
                      onChange={(e) => handleChange('mileage_at_service', e.target.value)}
                      className="bg-input border-border"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lf-cost" className="text-xs text-muted-foreground">Cost ($)</Label>
                    <Input
                      id="lf-cost"
                      type="number"
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      value={form.cost}
                      onChange={(e) => handleChange('cost', e.target.value)}
                      className="bg-input border-border"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lf-notes" className="text-xs text-muted-foreground">Notes</Label>
                  <Textarea
                    id="lf-notes"
                    placeholder="Parts replaced, shop name, observations..."
                    value={form.notes}
                    onChange={(e) => handleChange('notes', e.target.value)}
                    rows={3}
                    className="bg-input border-border resize-none text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Reminder section */}
          <div className="border border-border/60 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={handleShowReminder}
              className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-secondary/30 transition-colors text-left"
            >
              <span className="flex items-center gap-2 font-medium">
                <Bell className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                Set a next-service reminder
                {!showReminder && matchingReminder && (
                  <span className="text-[10px] font-semibold text-warning bg-warning/10 border border-warning/30 rounded px-1.5 py-0.5 shrink-0">
                    Existing
                  </span>
                )}
              </span>
              <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform shrink-0', showReminder && 'rotate-180')} />
            </button>

            {showReminder && (
              <div className="px-4 pb-4 space-y-4 border-t border-border/50">

                {/* Advance vs Create — only when a matching reminder exists */}
                {matchingReminder && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      You have a <strong className="text-foreground">{matchingReminder.service_type}</strong> reminder
                      {matchingReminder.next_due_mileage != null && (
                        <> due at <strong className="text-foreground">
                          {matchingReminder.next_due_mileage.toLocaleString()} mi
                        </strong></>
                      )}.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { setReminderAction('advance'); setReminderError('') }}
                        className={cn(
                          'flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors',
                          reminderAction === 'advance'
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-secondary/50 text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                        )}
                      >
                        Advance existing
                      </button>
                      <button
                        type="button"
                        onClick={() => { setReminderAction('create'); setReminderError('') }}
                        className={cn(
                          'flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors',
                          reminderAction === 'create'
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-secondary/50 text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                        )}
                      >
                        Create new
                      </button>
                    </div>
                  </div>
                )}

                {/* Interval presets */}
                <div className={cn('space-y-2', !matchingReminder && 'mt-3')}>
                  <Label className="text-xs text-muted-foreground">Service interval</Label>
                  <div className="flex flex-wrap gap-2">
                    {INTERVAL_PRESETS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => { setIntervalPreset(p); setCustomInterval(''); setReminderError('') }}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                          intervalPreset === p
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-secondary/50 text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                        )}
                      >
                        {p.toLocaleString()} mi
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => { setIntervalPreset(null); setReminderError('') }}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                        intervalPreset === null
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-secondary/50 text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                      )}
                    >
                      Custom
                    </button>
                  </div>
                  {intervalPreset === null && (
                    <Input
                      type="number"
                      placeholder="e.g. 10,000"
                      min="1"
                      value={customInterval}
                      onChange={(e) => { setCustomInterval(e.target.value); setReminderError('') }}
                      className="bg-input border-border"
                    />
                  )}
                </div>

                {/* Computed next due preview */}
                {previewDue !== null ? (
                  <p className="text-xs text-muted-foreground">
                    Next service due at:{' '}
                    <strong className="text-foreground">{previewDue.toLocaleString()} mi</strong>
                    {matchingReminder?.next_due_mileage != null && reminderAction === 'advance' && (
                      <span className="text-muted-foreground/60 ml-1">
                        (currently {matchingReminder.next_due_mileage.toLocaleString()} mi)
                      </span>
                    )}
                  </p>
                ) : !form.mileage_at_service ? (
                  <p className="text-xs text-muted-foreground/70">
                    Open "mileage, cost &amp; notes" above to enter a reading — needed to calculate the next due mileage.
                  </p>
                ) : null}

                {/* Early warning threshold */}
                <div className="flex items-center gap-2">
                  <Label htmlFor="lf-notify" className="text-xs text-muted-foreground shrink-0">
                    Warn me
                  </Label>
                  <Input
                    id="lf-notify"
                    type="number"
                    min="0"
                    value={notifyMilesBefore}
                    onChange={(e) => setNotifyMilesBefore(e.target.value)}
                    className="bg-input border-border w-20 h-7 text-xs"
                  />
                  <span className="text-xs text-muted-foreground shrink-0">mi before due</span>
                </div>

                {/* Inline error */}
                {reminderError && (
                  <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 leading-relaxed">
                    {reminderError}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              className="flex-1 border-border hover:bg-secondary"
              onClick={handleClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
              disabled={loading}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
