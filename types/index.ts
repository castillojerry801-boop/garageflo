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
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Attachment {
  id: string
  vehicle_id: string
  maintenance_id: string | null
  // Storage path in the private 'attachments' bucket.
  // Use createSignedUrl() for access — never getPublicUrl().
  file_url: string
  file_name: string
  file_type: string
  file_size: number | null
  label: string | null
  created_at: string
}

export type ReminderStatus = 'overdue' | 'due_soon' | 'ok'

export function getReminderStatus(
  reminder: Reminder,
  currentMileage?: number | null,
  currentHours?: number | null,
): ReminderStatus {
  const now = new Date()
  let result: ReminderStatus = 'ok'

  // Check all thresholds independently — return 'overdue' the moment any fires,
  // otherwise accumulate 'due_soon' so a later overdue threshold isn't shadowed.
  if (reminder.next_due_date) {
    const due = new Date(reminder.next_due_date)
    const daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (daysUntilDue < 0) return 'overdue'
    if (daysUntilDue <= 14) result = 'due_soon'
  }

  if (reminder.next_due_mileage != null && currentMileage != null) {
    const milesUntilDue = reminder.next_due_mileage - currentMileage
    if (milesUntilDue < 0) return 'overdue'
    if (milesUntilDue <= 500) result = 'due_soon'
  }

  if (reminder.next_due_hours != null && currentHours != null) {
    const hoursUntilDue = reminder.next_due_hours - currentHours
    if (hoursUntilDue < 0) return 'overdue'
    if (hoursUntilDue <= 10) result = 'due_soon'
  }

  return result
}

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  car: 'Car',
  truck: 'Truck',
  suv: 'SUV',
  motorcycle: 'Motorcycle',
  dirt_bike: 'Dirt Bike',
  utv: 'Side-by-Side (UTV)',
  atv: 'Four-Wheeler (ATV)',
  boat: 'Boat',
  personal_watercraft: 'Personal Watercraft (PWC)',
  snowmobile: 'Snowmobile',
  riding_mower: 'Riding Mower',
  push_mower: 'Push Mower',
  generator: 'Generator',
  trailer: 'Trailer',
  camp_trailer: 'Camp Trailer',
  other: 'Other',
}

export const VEHICLE_TYPE_EMOJI: Record<VehicleType, string> = {
  car: '🚗',
  truck: '🛻',
  suv: '🚙',
  motorcycle: '🏍️',
  dirt_bike: '🏍️',
  utv: '🏎️',
  atv: '🏍️',
  boat: '🛥️',
  personal_watercraft: '🚤',
  snowmobile: '🛷',
  riding_mower: '🌿',
  push_mower: '🌿',
  generator: '⚡',
  trailer: '🚛',
  camp_trailer: '🏕️',
  other: '🔧',
}

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
  'Registration',
  'Insurance',
  'Annual Inspection',
  'Other',
]
