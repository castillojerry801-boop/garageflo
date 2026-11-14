export type VehicleType =
  | 'car'
  | 'truck'
  | 'suv'
  | 'motorcycle'
  | 'utv'
  | 'atv'
  | 'boat'
  | 'trailer'
  | 'camp_trailer'
  | 'other'

export interface Vehicle {
  id: string
  garage_id: string
  user_id: string
  type: VehicleType
  year: number | null
  make: string | null
  model: string | null
  name: string
  mileage: number | null
  color: string | null
  notes: string | null
  photo_url: string | null
  created_at: string
  updated_at: string
}

export interface MaintenanceLog {
  id: string
  vehicle_id: string
  service_type: string
  performed_at: string
  mileage_at_service: number | null
  cost: number | null
  notes: string | null
  created_at: string
}

export interface Reminder {
  id: string
  vehicle_id: string
  service_type: string
  remind_by_date: string | null
  remind_by_mileage: number | null
  next_due_date: string | null
  next_due_mileage: number | null
  is_active: boolean
  created_at: string
}

export interface Attachment {
  id: string
  vehicle_id: string
  maintenance_id: string | null
  file_url: string
  file_name: string
  file_type: string
  label: string | null
  created_at: string
}

export type ReminderStatus = 'overdue' | 'due_soon' | 'ok'

export function getReminderStatus(reminder: Reminder, currentMileage?: number | null): ReminderStatus {
  const now = new Date()

  if (reminder.next_due_date) {
    const due = new Date(reminder.next_due_date)
    const daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (daysUntilDue < 0) return 'overdue'
    if (daysUntilDue <= 14) return 'due_soon'
  }

  if (reminder.next_due_mileage && currentMileage) {
    const milesUntilDue = reminder.next_due_mileage - currentMileage
    if (milesUntilDue < 0) return 'overdue'
    if (milesUntilDue <= 500) return 'due_soon'
  }

  return 'ok'
}

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  car: 'Car',
  truck: 'Truck',
  suv: 'SUV',
  motorcycle: 'Motorcycle',
  utv: 'Side-by-Side (UTV)',
  atv: 'Four-Wheeler (ATV)',
  boat: 'Boat',
  trailer: 'Trailer',
  camp_trailer: 'Camp Trailer',
  other: 'Other',
}

export const VEHICLE_TYPE_EMOJI: Record<VehicleType, string> = {
  car: '🚗',
  truck: '🛻',
  suv: '🚙',
  motorcycle: '🏍️',
  utv: '🏎️',
  atv: '🏍️',
  boat: '🛥️',
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
