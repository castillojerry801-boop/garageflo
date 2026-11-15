'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  MILES_INTERVAL_PRESETS,
  HOURS_INTERVAL_PRESETS,
  MONTHS_INTERVAL_PRESETS,
  hasStaleUsageThreshold,
  type Reminder,
  type TrackingMethod,
} from '@/types'
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
  trackingMethod?: TrackingMethod
  currentMileage?: number | null
  currentHours?: number | null
}

const QUICK_SERVICES_BY_METHOD: Record<TrackingMethod, string[]> = {
  mileage: ['Oil Change', 'Tire Rotation', 'Brake Inspection', 'Air Filter', 'Spark Plugs', 'Battery', 'Annual Inspection', 'Other'],
  hours:   ['Oil Change', 'Air Filter', 'Spark Plugs', 'Fuel Filter', 'Coolant Flush', 'Annual Inspection', 'Other'],
  both:    ['Oil Change', 'Impeller Replacement', 'Fuel Filter', 'Spark Plugs', 'Winterization', 'Annual Inspection', 'Other'],
  date:    ['Winterization', 'De-Winterization', 'Annual Inspection', 'Wheel Bearing Repack', 'Registration', 'Insurance', 'Other'],
}

export function LogForm({ vehicleId, reminders = [], trackingMethod = 'mileage', currentMileage, currentHours }: LogFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const idempotencyKeyRef = useRef(crypto.randomUUID())

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showOptional, setShowOptional] = useState(false)
  const [showReminder, setShowReminder] = useState(false)
  const [reminderAction, setReminderAction] = useState<'advance' | 'create'>('create')
  const [reminderError, setReminderError] = useState('')

  // Primary interval state (miles, hours, or months for date-only)
  const [primaryIntervalPreset, setPrimaryIntervalPreset] = useState<number | null>(null)
  const [customPrimaryInterval, setCustomPrimaryInterval] = useState('')
  // For 'both' tracking: which unit the user chose for primary interval
  const [bothUnit, setBothUnit] = useState<'miles' | 'hours'>('miles')
  // Calendar interval (optional for all non-date methods; primary for 'date')
  const [calendarPreset, setCalendarPreset] = useState<number | null>(null)
  const [customCalendarInterval, setCustomCalendarInterval] = useState('')
  const [showCalendar, setShowCalendar] = useState(false)
  // Miles early-warning
  const [notifyMilesBefore, setNotifyMilesBefore] = useState('500')
  // Hours early-warning
  const [notifyHoursBefore, setNotifyHoursBefore] = useState('10')

  const [form, setForm] = useState({
    service_type: '',
    custom_service: '',
    performed_at: new Date().toISOString().split('T')[0],
    mileage_at_service: '',
    hours_at_service: '',
    cost: '',
    notes: '',
  })

  const showMileageInput = trackingMethod === 'mileage' || trackingMethod === 'both'
  const showHoursInput   = trackingMethod === 'hours'   || trackingMethod === 'both'

  const serviceType = form.service_type === 'Other'
    ? form.custom_service.trim()
    : form.service_type

  const matchingReminder = serviceType
    ? reminders.find(r => r.is_active && r.service_type === serviceType) ?? null
    : null

  // The unit used for primary interval in 'both' mode
  const effectiveUnit: 'miles' | 'hours' | 'months' | null =
    trackingMethod === 'date'    ? 'months' :
    trackingMethod === 'mileage' ? 'miles'  :
    trackingMethod === 'hours'   ? 'hours'  :
    bothUnit

  function handleChange(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
    setReminderError('')
  }

  function handleServiceTypeSelect(type: string) {
    setForm(prev => ({ ...prev, service_type: type, custom_service: '' }))
    setReminderError('')

    const match = type !== 'Other'
      ? reminders.find(r => r.is_active && r.service_type === type) ?? null
      : null

    if (match) {
      setReminderAction('advance')
      setNotifyMilesBefore(match.notify_miles_before?.toString() ?? '500')
      setNotifyHoursBefore(match.notify_hours_before?.toString() ?? '10')

      // Pre-fill primary interval from existing reminder
      const intervalMiles = match.interval_miles
      const intervalHours = match.interval_hours
      const intervalMonths = match.interval_months

      if (intervalMiles && (trackingMethod === 'mileage' || (trackingMethod === 'both' && !intervalHours))) {
        setBothUnit('miles')
        const isPreset = (MILES_INTERVAL_PRESETS as readonly number[]).includes(intervalMiles)
        setPrimaryIntervalPreset(isPreset ? intervalMiles : null)
        setCustomPrimaryInterval(isPreset ? '' : intervalMiles.toString())
      } else if (intervalHours && (trackingMethod === 'hours' || trackingMethod === 'both')) {
        setBothUnit('hours')
        const isPreset = (HOURS_INTERVAL_PRESETS as readonly number[]).includes(intervalHours)
        setPrimaryIntervalPreset(isPreset ? intervalHours : null)
        setCustomPrimaryInterval(isPreset ? '' : intervalHours.toString())
      } else {
        setPrimaryIntervalPreset(null)
        setCustomPrimaryInterval('')
      }

      if (intervalMonths) {
        const isPreset = (MONTHS_INTERVAL_PRESETS as readonly number[]).includes(intervalMonths)
        setCalendarPreset(isPreset ? intervalMonths : null)
        setCustomCalendarInterval(isPreset ? '' : intervalMonths.toString())
        setShowCalendar(true)
      }
    } else {
      setReminderAction('create')
      setPrimaryIntervalPreset(null)
      setCustomPrimaryInterval('')
      setCalendarPreset(null)
      setCustomCalendarInterval('')
    }
  }

  function getEffectivePrimaryInterval(): number | null {
    if (primaryIntervalPreset !== null) return primaryIntervalPreset
    const parsed = parseFloat(customPrimaryInterval)
    return isNaN(parsed) || parsed <= 0 ? null : parsed
  }

  function getEffectiveCalendarInterval(): number | null {
    if (calendarPreset !== null) return calendarPreset
    const parsed = parseInt(customCalendarInterval)
    return isNaN(parsed) || parsed <= 0 ? null : parsed
  }

  function handleClose() {
    setOpen(false)
    setShowOptional(false)
    setShowReminder(false)
    setReminderAction('create')
    setPrimaryIntervalPreset(null)
    setCustomPrimaryInterval('')
    setCalendarPreset(null)
    setCustomCalendarInterval('')
    setShowCalendar(false)
    setNotifyMilesBefore('500')
    setNotifyHoursBefore('10')
    setReminderError('')
    setBothUnit('miles')
    setForm({
      service_type: '', custom_service: '',
      performed_at: new Date().toISOString().split('T')[0],
      mileage_at_service: '', hours_at_service: '', cost: '', notes: '',
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
    const hoursNum = form.hours_at_service ? parseFloat(form.hours_at_service) : null
    const costNum = form.cost ? parseFloat(form.cost) : null
    const primaryInterval = showReminder ? getEffectivePrimaryInterval() : null
    const calendarInterval = showReminder && showCalendar ? getEffectiveCalendarInterval() : null

    if (showReminder) {
      // Date-only mode requires a calendar interval
      if (trackingMethod === 'date') {
        if (primaryInterval === null) {
          toast.error('Enter a valid interval in months')
          return
        }
      } else {
        // For non-date modes, require primary interval if the reminder toggle is on
        if (primaryInterval === null && calendarInterval === null) {
          toast.error('Enter a valid service interval')
          return
        }
        // For mileage-based intervals, require the mileage reading
        if (primaryInterval !== null && effectiveUnit === 'miles' && mileageNum === null) {
          setReminderError('Enter a mileage reading above to calculate the next due mileage.')
          setShowOptional(true)
          return
        }
        // For hours-based intervals, require the hours reading
        if (primaryInterval !== null && effectiveUnit === 'hours' && hoursNum === null) {
          setReminderError('Enter an engine hours reading above to calculate the next due hours.')
          setShowOptional(true)
          return
        }
      }
    }

    const effectiveAction = showReminder && reminderAction === 'advance' && matchingReminder ? 'advance' : 'create'
    const reminderIdParam = effectiveAction === 'advance' && matchingReminder ? matchingReminder.id : null

    // Build RPC params for v2
    let p_interval_miles: number | null = null
    let p_interval_hours: number | null = null
    let p_interval_months: number | null = null

    if (showReminder) {
      if (trackingMethod === 'date') {
        p_interval_months = primaryInterval
      } else if (effectiveUnit === 'miles') {
        p_interval_miles = primaryInterval
        p_interval_months = calendarInterval
      } else if (effectiveUnit === 'hours') {
        p_interval_hours = primaryInterval
        p_interval_months = calendarInterval
      }
    }

    setLoading(true)

    const { error } = await supabase.rpc('log_service_v2', {
      p_vehicle_id:          vehicleId,
      p_service_type:        serviceType,
      p_performed_at:        form.performed_at,
      p_mileage_at_service:  mileageNum,
      p_cost:                costNum,
      p_notes:               form.notes.trim() || null,
      p_reminder_id:         reminderIdParam,
      p_interval_miles,
      p_notify_miles_before: showReminder && notifyMilesBefore ? parseInt(notifyMilesBefore) : null,
      p_idempotency_key:     idempotencyKeyRef.current,
      p_hours_at_service:    hoursNum,
      p_interval_hours,
      p_notify_hours_before: showReminder && notifyHoursBefore ? parseFloat(notifyHoursBefore) : null,
      p_interval_months,
    })

    setLoading(false)

    if (error) {
      const msg = error.message ?? ''
      const detail = (error as { details?: string }).details ?? ''

      if (msg.includes('reminder_regression_blocked_hours')) {
        const match = detail.match(/computed=([0-9.]+) current=([0-9.]+)/)
        if (match) {
          setReminderError(
            `This interval would set the next service at ${parseFloat(match[1]).toLocaleString()} hrs, behind the current schedule at ${parseFloat(match[2]).toLocaleString()} hrs. Increase the interval or choose a later service date.`
          )
        } else {
          setReminderError('The computed hours due is behind the current schedule. Increase the interval.')
        }
      } else if (msg.includes('reminder_regression_blocked')) {
        const match = detail.match(/computed=(\d+) current=(\d+)/)
        if (match) {
          setReminderError(
            `This interval would set the next service at ${parseInt(match[1]).toLocaleString()} mi, behind the current schedule at ${parseInt(match[2]).toLocaleString()} mi. Increase the interval or choose a later service date.`
          )
        } else {
          setReminderError('The computed due mileage is behind the current schedule. Increase the interval.')
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

    idempotencyKeyRef.current = crypto.randomUUID()
    toast.success('Service logged!')
    handleClose()
    router.refresh()
  }

  // Preview of next due value
  const primaryIntervalVal = getEffectivePrimaryInterval()
  const previewDueMiles = effectiveUnit === 'miles' && form.mileage_at_service && primaryIntervalVal !== null
    ? parseInt(form.mileage_at_service) + primaryIntervalVal
    : null
  const previewDueHours = effectiveUnit === 'hours' && form.hours_at_service && primaryIntervalVal !== null
    ? parseFloat(form.hours_at_service) + primaryIntervalVal
    : null

  // Show a warning when advancing a combined reminder calendar-only without
  // providing the matching usage reading — the threshold stays unchanged and
  // may leave the reminder showing overdue immediately after the service.
  const isAdvancing = showReminder && reminderAction === 'advance' && matchingReminder !== null
  const staleMilesWarning = isAdvancing && showMileageInput
    && hasStaleUsageThreshold(matchingReminder, 'miles', !!form.mileage_at_service)
  const staleHoursWarning = isAdvancing && showHoursInput
    && hasStaleUsageThreshold(matchingReminder, 'hours', !!form.hours_at_service)

  const quickServices = QUICK_SERVICES_BY_METHOD[trackingMethod]

  const optionalLabel = trackingMethod === 'date'
    ? 'Add cost & notes'
    : trackingMethod === 'hours'
    ? 'Add engine hours, cost & notes'
    : trackingMethod === 'both'
    ? 'Add mileage, engine hours, cost & notes'
    : 'Add mileage, cost & notes'

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
              {quickServices.map((type) => (
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
              {showOptional ? 'Hide' : 'Add'} {optionalLabel.toLowerCase()}
            </button>

            {showOptional && (
              <div className="space-y-4 mt-4">
                <div className={cn('grid gap-3', (showMileageInput || showHoursInput) ? 'grid-cols-2' : 'grid-cols-1')}>
                  {showMileageInput && (
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
                  )}
                  {showHoursInput && (
                    <div className="space-y-1.5">
                      <Label htmlFor="lf-hours" className="text-xs text-muted-foreground">Engine Hours</Label>
                      <Input
                        id="lf-hours"
                        type="number"
                        placeholder="250.5"
                        min="0"
                        step="0.1"
                        value={form.hours_at_service}
                        onChange={(e) => handleChange('hours_at_service', e.target.value)}
                        className="bg-input border-border"
                      />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
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
              onClick={() => { setShowReminder(v => !v); setReminderError('') }}
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
                      )}
                      {matchingReminder.next_due_hours != null && (
                        <> due at <strong className="text-foreground">
                          {matchingReminder.next_due_hours.toLocaleString()} hrs
                        </strong></>
                      )}
                      {matchingReminder.next_due_date && (
                        <> due {new Date(matchingReminder.next_due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>
                      )}.
                    </p>
                    <div className="flex gap-2">
                      {(['advance', 'create'] as const).map((action) => (
                        <button
                          key={action}
                          type="button"
                          onClick={() => { setReminderAction(action); setReminderError('') }}
                          className={cn(
                            'flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors',
                            reminderAction === action
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-secondary/50 text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                          )}
                        >
                          {action === 'advance' ? 'Advance existing' : 'Create new'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Stale threshold warnings — shown when advancing a combined reminder
                    without the usage reading needed to recompute that threshold */}
                {staleMilesWarning && (
                  <div className="text-xs bg-warning/10 border border-warning/30 rounded-lg px-3 py-2.5 leading-relaxed space-y-1">
                    <p className="font-semibold text-warning">Mileage threshold won't be recalculated</p>
                    <p className="text-muted-foreground">
                      {matchingReminder?.next_due_mileage != null && currentMileage != null && currentMileage >= matchingReminder.next_due_mileage
                        ? <>This reminder's mileage threshold ({matchingReminder.next_due_mileage.toLocaleString()} mi) is already overdue at your current {currentMileage.toLocaleString()} mi. Without a mileage reading, it stays overdue after logging. </>
                        : <>This reminder also tracks mileage. Without a mileage reading, the{matchingReminder?.next_due_mileage != null ? ` ${matchingReminder.next_due_mileage.toLocaleString()} mi` : ''} threshold won't advance. </>
                      }
                      <span className="text-foreground font-medium">Open the optional section above to enter the current mileage.</span>
                    </p>
                  </div>
                )}
                {staleHoursWarning && (
                  <div className="text-xs bg-warning/10 border border-warning/30 rounded-lg px-3 py-2.5 leading-relaxed space-y-1">
                    <p className="font-semibold text-warning">Engine hours threshold won't be recalculated</p>
                    <p className="text-muted-foreground">
                      {matchingReminder?.next_due_hours != null && currentHours != null && currentHours >= matchingReminder.next_due_hours
                        ? <>This reminder's hours threshold ({matchingReminder.next_due_hours.toLocaleString()} hrs) is already overdue at your current {currentHours.toLocaleString()} hrs. Without an hours reading, it stays overdue after logging. </>
                        : <>This reminder also tracks engine hours. Without an hours reading, the{matchingReminder?.next_due_hours != null ? ` ${matchingReminder.next_due_hours.toLocaleString()} hrs` : ''} threshold won't advance. </>
                      }
                      <span className="text-foreground font-medium">Open the optional section above to enter the current engine hours.</span>
                    </p>
                  </div>
                )}

                {/* Primary interval section */}
                <div className={cn('space-y-2', !matchingReminder && 'mt-3')}>

                  {/* For 'both' tracking: unit picker */}
                  {trackingMethod === 'both' && (
                    <div className="flex gap-2 mb-2">
                      {(['miles', 'hours'] as const).map((unit) => (
                        <button
                          key={unit}
                          type="button"
                          onClick={() => { setBothUnit(unit); setPrimaryIntervalPreset(null); setCustomPrimaryInterval(''); setReminderError('') }}
                          className={cn(
                            'flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                            bothUnit === unit
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-secondary/50 text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                          )}
                        >
                          {unit === 'miles' ? 'Miles' : 'Engine Hours'}
                        </button>
                      ))}
                    </div>
                  )}

                  <Label className="text-xs text-muted-foreground">
                    {trackingMethod === 'date' ? 'Remind every' : 'Service interval'}
                  </Label>

                  {/* Preset chips */}
                  <div className="flex flex-wrap gap-2">
                    {(trackingMethod === 'date'
                      ? MONTHS_INTERVAL_PRESETS
                      : effectiveUnit === 'hours'
                      ? HOURS_INTERVAL_PRESETS
                      : MILES_INTERVAL_PRESETS
                    ).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => { setPrimaryIntervalPreset(p); setCustomPrimaryInterval(''); setReminderError('') }}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                          primaryIntervalPreset === p
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-secondary/50 text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                        )}
                      >
                        {trackingMethod === 'date' ? `${p} mo` : effectiveUnit === 'hours' ? `${p} hrs` : `${p.toLocaleString()} mi`}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => { setPrimaryIntervalPreset(null); setReminderError('') }}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                        primaryIntervalPreset === null
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-secondary/50 text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                      )}
                    >
                      Custom
                    </button>
                  </div>

                  {primaryIntervalPreset === null && (
                    <Input
                      type="number"
                      placeholder={
                        trackingMethod === 'date' ? 'months' :
                        effectiveUnit === 'hours' ? 'hours' : 'miles'
                      }
                      min="1"
                      step={effectiveUnit === 'hours' ? '0.1' : '1'}
                      value={customPrimaryInterval}
                      onChange={(e) => { setCustomPrimaryInterval(e.target.value); setReminderError('') }}
                      className="bg-input border-border"
                    />
                  )}
                </div>

                {/* Preview next due */}
                {previewDueMiles !== null && (
                  <p className="text-xs text-muted-foreground">
                    Next service due at:{' '}
                    <strong className="text-foreground">{previewDueMiles.toLocaleString()} mi</strong>
                    {matchingReminder?.next_due_mileage != null && reminderAction === 'advance' && (
                      <span className="text-muted-foreground/60 ml-1">
                        (currently {matchingReminder.next_due_mileage.toLocaleString()} mi)
                      </span>
                    )}
                  </p>
                )}
                {previewDueHours !== null && (
                  <p className="text-xs text-muted-foreground">
                    Next service due at:{' '}
                    <strong className="text-foreground">{previewDueHours.toLocaleString()} hrs</strong>
                    {matchingReminder?.next_due_hours != null && reminderAction === 'advance' && (
                      <span className="text-muted-foreground/60 ml-1">
                        (currently {matchingReminder.next_due_hours.toLocaleString()} hrs)
                      </span>
                    )}
                  </p>
                )}
                {!form.mileage_at_service && effectiveUnit === 'miles' && trackingMethod !== 'date' && (
                  <p className="text-xs text-muted-foreground/70">
                    Open the optional section above to enter a mileage reading — needed to calculate the next due mileage.
                  </p>
                )}
                {!form.hours_at_service && effectiveUnit === 'hours' && (
                  <p className="text-xs text-muted-foreground/70">
                    Open the optional section above to enter an engine hours reading — needed to calculate the next due hours.
                  </p>
                )}

                {/* Optional calendar interval (not shown for date-only mode) */}
                {trackingMethod !== 'date' && (
                  <div>
                    <button
                      type="button"
                      onClick={() => { setShowCalendar(v => !v); setCalendarPreset(null); setCustomCalendarInterval('') }}
                      className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronDown className={cn('h-3 w-3 transition-transform', showCalendar && 'rotate-180')} />
                      {showCalendar ? 'Remove' : 'Also remind'} by calendar date
                    </button>
                    {showCalendar && (
                      <div className="space-y-2 mt-2">
                        <div className="flex flex-wrap gap-2">
                          {MONTHS_INTERVAL_PRESETS.map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => { setCalendarPreset(p); setCustomCalendarInterval('') }}
                              className={cn(
                                'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                                calendarPreset === p
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-secondary/50 text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                              )}
                            >
                              {p} mo
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setCalendarPreset(null)}
                            className={cn(
                              'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                              calendarPreset === null
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-secondary/50 text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                            )}
                          >
                            Custom
                          </button>
                        </div>
                        {calendarPreset === null && (
                          <Input
                            type="number"
                            placeholder="months"
                            min="1"
                            value={customCalendarInterval}
                            onChange={(e) => setCustomCalendarInterval(e.target.value)}
                            className="bg-input border-border"
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Early warning thresholds */}
                {(effectiveUnit === 'miles') && (
                  <div className="flex items-center gap-2">
                    <Label htmlFor="lf-notify-miles" className="text-xs text-muted-foreground shrink-0">Warn me</Label>
                    <Input
                      id="lf-notify-miles"
                      type="number"
                      min="0"
                      value={notifyMilesBefore}
                      onChange={(e) => setNotifyMilesBefore(e.target.value)}
                      className="bg-input border-border w-20 h-7 text-xs"
                    />
                    <span className="text-xs text-muted-foreground shrink-0">mi before due</span>
                  </div>
                )}
                {(effectiveUnit === 'hours') && (
                  <div className="flex items-center gap-2">
                    <Label htmlFor="lf-notify-hours" className="text-xs text-muted-foreground shrink-0">Warn me</Label>
                    <Input
                      id="lf-notify-hours"
                      type="number"
                      min="0"
                      step="0.5"
                      value={notifyHoursBefore}
                      onChange={(e) => setNotifyHoursBefore(e.target.value)}
                      className="bg-input border-border w-20 h-7 text-xs"
                    />
                    <span className="text-xs text-muted-foreground shrink-0">hrs before due</span>
                  </div>
                )}

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
