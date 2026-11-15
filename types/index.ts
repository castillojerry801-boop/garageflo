import { parseDateLocal } from '@/lib/utils'

export type VehicleType =
  | 'car'
  | 'truck'
  | 'suv'
  | 'motorcycle'
  | 'dirt_bike'
  | 'utv'
  | 'atv'
  | 'boat'
  | 'personal_watercraft'
  | 'snowmobile'
  | 'riding_mower'
  | 'push_mower'
  | 'generator'
  | 'trailer'
  | 'camp_trailer'
  | 'other'

// How a garage item tracks usage. Set per-item; defaults are type-based.
export type TrackingMethod = 'mileage' | 'hours' | 'both' | 'date'

// Sensible defaults by equipment type — users can override.
export const TRACKING_METHOD_DEFAULTS: Record<VehicleType, TrackingMethod> = {
  car:                'mileage',
  truck:              'mileage',
  suv:                'mileage',
  motorcycle:         'mileage',
  dirt_bike:          'both',
  utv:                'both',
  atv:                'both',
  boat:               'both',
  personal_watercraft:'both',
  snowmobile:         'both',
  riding_mower:       'hours',
  push_mower:         'hours',
  generator:          'hours',
  trailer:            'date',
  camp_trailer:       'date',
  other:              'mileage',
}

export const TRACKING_METHOD_LABELS: Record<TrackingMethod, string> = {
  mileage: 'Mileage',
  hours:   'Engine Hours',
  both:    'Mileage & Hours',
  date:    'Date Only',
}

// Service interval presets by unit.
export const MILES_INTERVAL_PRESETS  = [3000, 5000, 7500] as const
export const HOURS_INTERVAL_PRESETS  = [25, 50, 100]      as const
export const MONTHS_INTERVAL_PRESETS = [3, 6, 12]         as const

export interface Garage {
  id: string
  user_id: string
  name: string
  notify_days_before: number
  notify_miles_before: number
  notify_hours_before: number
  email_notifications: boolean
  created_at: string
  updated_at: string
}

export interface Vehicle {
  id: string
  garage_id: string
  user_id: string
  type: VehicleType
  tracking_method: TrackingMethod
  year: number | null
  make: string | null
  model: string | null
  name: string
  color: string | null
  vin: string | null
  serial_number: string | null
  notes: string | null
  photo_url: string | null
  mileage: number | null
  mileage_is_estimated: boolean
  mileage_as_of: string | null
  engine_hours: number | null
  engine_hours_is_estimated: boolean
  engine_hours_as_of: string | null
  estimated_annual_mileage: number | null
  estimated_annual_hours: number | null
  created_at: string
  updated_at: string
}

export interface MaintenanceLog {
  id: string
  vehicle_id: string
  service_type: string
  performed_at: string
  mileage_at_service: number | null
  hours_at_service: number | null
  cost: number | null
  notes: string | null
  idempotency_key: string | null
  reminder_id: string | null
  created_at: string
  updated_at: string
}

export interface Reminder {
  id: string
  vehicle_id: string
  service_type: string
  notes: string | null
  next_due_date: string | null
  next_due_mileage: number | null
  next_due_hours: number | null
  interval_months: number | null
  interval_miles: number | null
  interval_hours: number | null
  notify_miles_before: number | null
  notify_hours_before: number | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Attachment {
  id: string
  vehicle_id: string
  maintenance_id: string | null
  file_url: string
  file_name: string
  file_type: string
  file_size: number | null
  label: string | null
  created_at: string
}

// 4-state reminder status.
// Severity order: ok < approaching < due < overdue
export type ReminderStatus = 'overdue' | 'due' | 'approaching' | 'ok'

const STATUS_RANK: Record<ReminderStatus, number> = {
  ok: 0,
  approaching: 1,
  due: 2,
  overdue: 3,
}

export function getReminderStatus(
  reminder: Reminder,
  currentMileage?: number | null,
  currentHours?: number | null,
): ReminderStatus {
  let result: ReminderStatus = 'ok'

  function accumulate(s: ReminderStatus) {
    if (STATUS_RANK[s] > STATUS_RANK[result]) result = s
  }

  // Date threshold — compare local calendar days, not UTC timestamps.
  if (reminder.next_due_date) {
    const due = parseDateLocal(reminder.next_due_date)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const daysUntilDue = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (daysUntilDue < 0)       accumulate('overdue')
    else if (daysUntilDue === 0) accumulate('due')
    else if (daysUntilDue <= 14) accumulate('approaching')
  }

  // Mileage threshold — per-reminder early-warning window, falls back to 500 mi
  if (reminder.next_due_mileage != null && currentMileage != null) {
    const earlyWarnMiles = reminder.notify_miles_before ?? 500
    const milesUntilDue = reminder.next_due_mileage - currentMileage
    if (milesUntilDue < 0)              accumulate('overdue')
    else if (milesUntilDue === 0)        accumulate('due')
    else if (milesUntilDue <= earlyWarnMiles) accumulate('approaching')
  }

  // Hours threshold — per-reminder early-warning window, falls back to 10 hrs
  if (reminder.next_due_hours != null && currentHours != null) {
    const earlyWarnHours = reminder.notify_hours_before ?? 10
    const hoursUntilDue = reminder.next_due_hours - currentHours
    if (hoursUntilDue < 0)               accumulate('overdue')
    else if (hoursUntilDue === 0)         accumulate('due')
    else if (hoursUntilDue <= earlyWarnHours) accumulate('approaching')
  }

  return result
}

// Returns true when an active reminder has a recurring usage threshold that
// cannot be recomputed because no matching usage reading was provided.
// Used in LogForm to surface a warning before submission.
export function hasStaleUsageThreshold(
  reminder: Reminder | null | undefined,
  unit: 'miles' | 'hours',
  readingProvided: boolean,
): boolean {
  if (!reminder || readingProvided) return false
  if (unit === 'miles') return reminder.interval_miles != null
  return reminder.interval_hours != null
}

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  car:                'Car',
  truck:              'Truck',
  suv:                'SUV',
  motorcycle:         'Motorcycle',
  dirt_bike:          'Dirt Bike',
  utv:                'Side-by-Side (UTV)',
  atv:                'Four-Wheeler (ATV)',
  boat:               'Boat',
  personal_watercraft:'Personal Watercraft (PWC)',
  snowmobile:         'Snowmobile',
  riding_mower:       'Riding Mower',
  push_mower:         'Push Mower',
  generator:          'Generator',
  trailer:            'Trailer',
  camp_trailer:       'Camp Trailer',
  other:              'Other',
}

export const VEHICLE_TYPE_EMOJI: Record<VehicleType, string> = {
  car:                '🚗',
  truck:              '🛻',
  suv:                '🚙',
  motorcycle:         '🏍️',
  dirt_bike:          '🏍️',
  utv:                '🏎️',
  atv:                '🏍️',
  boat:               '🛥️',
  personal_watercraft:'🚤',
  snowmobile:         '🛷',
  riding_mower:       '🌿',
  push_mower:         '🌿',
  generator:          '⚡',
  trailer:            '🚛',
  camp_trailer:       '🏕️',
  other:              '🔧',
}

// Expanded service type list covering all equipment categories.
export const COMMON_SERVICE_TYPES = [
  'Oil Change',
  'Tire Rotation',
  'Brake Inspection',
  'Air Filter',
  'Fuel Filter',
  'Spark Plugs',
  'Battery',
  'Coolant Flush',
  'Transmission Service',
  'Differential Service',
  'Belt Replacement',
  'Fluid Check',
  'Impeller Replacement',
  'Winterization',
  'De-Winterization',
  'Wheel Bearing Repack',
  'Blade Sharpening',
  'Blade Replacement',
  'Carburetor Service',
  'Registration',
  'Insurance',
  'Annual Inspection',
  'Other',
]
