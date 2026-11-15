import { describe, it, expect } from 'vitest'
import { getReminderStatus, hasStaleUsageThreshold, type Reminder } from '../types/index'

// Minimal reminder stub — only the fields getReminderStatus reads.
function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: 'r1',
    vehicle_id: 'v1',
    service_type: 'Oil Change',
    notes: null,
    next_due_date: null,
    next_due_mileage: null,
    next_due_hours: null,
    interval_months: null,
    interval_miles: null,
    interval_hours: null,
    notify_miles_before: null,   // null → falls back to 500-mile default
    notify_hours_before: null,   // null → falls back to 10-hour default
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

// ── Status thresholds ──────────────────────────────────────────────

describe('getReminderStatus — mileage thresholds', () => {
  const DUE_AT = 175_000
  const WARNING = 500   // default

  it('returns ok when well ahead of schedule (mileUntilDue > warning)', () => {
    const r = makeReminder({ next_due_mileage: DUE_AT })
    expect(getReminderStatus(r, DUE_AT - WARNING - 1)).toBe('ok')      // 174,499
  })

  it('returns approaching at the edge of the warning window', () => {
    const r = makeReminder({ next_due_mileage: DUE_AT })
    expect(getReminderStatus(r, DUE_AT - WARNING)).toBe('approaching')  // 174,500
  })

  it('returns approaching anywhere inside the warning window', () => {
    const r = makeReminder({ next_due_mileage: DUE_AT })
    expect(getReminderStatus(r, DUE_AT - 1)).toBe('approaching')        // 174,999
  })

  it('returns due at exactly the threshold', () => {
    const r = makeReminder({ next_due_mileage: DUE_AT })
    expect(getReminderStatus(r, DUE_AT)).toBe('due')                    // 175,000
  })

  it('returns overdue one mile past the threshold', () => {
    const r = makeReminder({ next_due_mileage: DUE_AT })
    expect(getReminderStatus(r, DUE_AT + 1)).toBe('overdue')            // 175,001
  })

  it('returns ok when no current mileage is provided', () => {
    const r = makeReminder({ next_due_mileage: DUE_AT })
    expect(getReminderStatus(r, null)).toBe('ok')
  })
})

describe('getReminderStatus — per-reminder notify_miles_before', () => {
  it('uses remind.notify_miles_before when set', () => {
    const r = makeReminder({ next_due_mileage: 100_000, notify_miles_before: 1000 })
    expect(getReminderStatus(r, 98_999)).toBe('ok')           // 1001 mi to go — outside 1000-mi window
    expect(getReminderStatus(r, 99_000)).toBe('approaching')  // 1000 mi to go — edge of window
    expect(getReminderStatus(r, 99_999)).toBe('approaching')  // 1 mi to go — still approaching
    expect(getReminderStatus(r, 100_000)).toBe('due')
    expect(getReminderStatus(r, 100_001)).toBe('overdue')
  })

  it('falls back to 500-mile default when notify_miles_before is null', () => {
    const r = makeReminder({ next_due_mileage: 50_000, notify_miles_before: null })
    expect(getReminderStatus(r, 49_499)).toBe('ok')
    expect(getReminderStatus(r, 49_500)).toBe('approaching')
  })
})

// ── Multi-threshold precedence ──────────────────────────────────────

describe('getReminderStatus — multi-threshold precedence', () => {
  it('returns overdue when date is past even if mileage is ok', () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0]
    const r = makeReminder({
      next_due_date: yesterday,
      next_due_mileage: 999_999, // far in the future
    })
    expect(getReminderStatus(r, 1000)).toBe('overdue')
  })

  it('returns overdue (not approaching) when mileage is overdue and date is approaching', () => {
    const twoDays = new Date(Date.now() + 2 * 86_400_000).toISOString().split('T')[0]
    const r = makeReminder({
      next_due_date: twoDays,          // approaching by date
      next_due_mileage: 50_000,        // overdue by mileage
    })
    expect(getReminderStatus(r, 50_001)).toBe('overdue')
  })

  it('returns approaching when only the date dimension is approaching', () => {
    const inWeek = new Date(Date.now() + 7 * 86_400_000).toISOString().split('T')[0]
    const r = makeReminder({ next_due_date: inWeek })
    expect(getReminderStatus(r)).toBe('approaching')
  })
})

// ── Odometer sync decision logic ───────────────────────────────────
// These tests document the three-branch rule defined in migration-m3.sql
// and enforced client-side in EditVehicleDialog.

describe('odometer sync decision (branch logic)', () => {
  // Branch 1: no current mileage → always accept
  it('accepts any reading when vehicle has no existing mileage', () => {
    expect(shouldSync({ currentMileage: null, currentEstimated: false, newMileage: 50_000, currentAsOf: null, newDate: '2024-01-01' })).toBe(true)
  })

  // Branch 2: current is estimated → newer confirmed replaces at any value
  it('replaces estimated mileage with lower confirmed reading on same date', () => {
    expect(shouldSync({ currentMileage: 185_000, currentEstimated: true, newMileage: 183_000, currentAsOf: '2024-06-01', newDate: '2024-06-01' })).toBe(true)
  })

  it('does not replace estimated mileage with an older reading', () => {
    expect(shouldSync({ currentMileage: 185_000, currentEstimated: true, newMileage: 183_000, currentAsOf: '2024-06-01', newDate: '2024-05-01' })).toBe(false)
  })

  // Branch 3: current is confirmed → only increase, only if more recent
  it('increases confirmed mileage with a higher, more-recent reading', () => {
    expect(shouldSync({ currentMileage: 170_000, currentEstimated: false, newMileage: 175_000, currentAsOf: '2024-01-01', newDate: '2024-06-01' })).toBe(true)
  })

  it('does not decrease confirmed mileage even with a more-recent reading', () => {
    expect(shouldSync({ currentMileage: 175_000, currentEstimated: false, newMileage: 170_000, currentAsOf: '2024-01-01', newDate: '2024-06-01' })).toBe(false)
  })

  it('does not update confirmed mileage with an older reading even if higher', () => {
    expect(shouldSync({ currentMileage: 170_000, currentEstimated: false, newMileage: 175_000, currentAsOf: '2024-06-01', newDate: '2024-01-01' })).toBe(false)
  })
})

// ── Idempotency key rotation ───────────────────────────────────────

describe('idempotency key behavior', () => {
  it('generates a valid UUID v4', () => {
    const key = crypto.randomUUID()
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })

  it('generates a different key on each call', () => {
    expect(crypto.randomUUID()).not.toBe(crypto.randomUUID())
  })
})

// ── Hour thresholds ────────────────────────────────────────────────

describe('getReminderStatus — hour thresholds', () => {
  const DUE_AT = 500   // engine hours
  const WARNING = 10   // default

  it('returns ok when well ahead of schedule (hoursUntilDue > warning)', () => {
    const r = makeReminder({ next_due_hours: DUE_AT })
    expect(getReminderStatus(r, null, DUE_AT - WARNING - 1)).toBe('ok')      // 489 hrs
  })

  it('returns approaching at the edge of the warning window', () => {
    const r = makeReminder({ next_due_hours: DUE_AT })
    expect(getReminderStatus(r, null, DUE_AT - WARNING)).toBe('approaching')  // 490 hrs
  })

  it('returns approaching anywhere inside the warning window', () => {
    const r = makeReminder({ next_due_hours: DUE_AT })
    expect(getReminderStatus(r, null, DUE_AT - 1)).toBe('approaching')        // 499 hrs
  })

  it('returns due at exactly the threshold', () => {
    const r = makeReminder({ next_due_hours: DUE_AT })
    expect(getReminderStatus(r, null, DUE_AT)).toBe('due')                    // 500 hrs
  })

  it('returns overdue one hour past the threshold', () => {
    const r = makeReminder({ next_due_hours: DUE_AT })
    expect(getReminderStatus(r, null, DUE_AT + 1)).toBe('overdue')            // 501 hrs
  })

  it('returns ok when no current hours are provided', () => {
    const r = makeReminder({ next_due_hours: DUE_AT })
    expect(getReminderStatus(r, null, null)).toBe('ok')
  })
})

describe('getReminderStatus — per-reminder notify_hours_before', () => {
  it('uses reminder.notify_hours_before when set', () => {
    const r = makeReminder({ next_due_hours: 300, notify_hours_before: 25 })
    expect(getReminderStatus(r, null, 274)).toBe('ok')           // 26 hrs to go — outside 25-hr window
    expect(getReminderStatus(r, null, 275)).toBe('approaching')  // 25 hrs to go — edge of window
    expect(getReminderStatus(r, null, 299)).toBe('approaching')  // 1 hr to go — still approaching
    expect(getReminderStatus(r, null, 300)).toBe('due')
    expect(getReminderStatus(r, null, 301)).toBe('overdue')
  })

  it('falls back to 10-hour default when notify_hours_before is null', () => {
    const r = makeReminder({ next_due_hours: 200, notify_hours_before: null })
    expect(getReminderStatus(r, null, 189)).toBe('ok')
    expect(getReminderStatus(r, null, 190)).toBe('approaching')
  })
})

// ── Combined hour + date thresholds ───────────────────────────────

describe('getReminderStatus — combined thresholds (hours + date)', () => {
  it('returns overdue when date is past even if hours are ok', () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0]
    const r = makeReminder({
      next_due_date: yesterday,
      next_due_hours: 9999, // far in the future
    })
    expect(getReminderStatus(r, null, 1)).toBe('overdue')
  })

  it('returns overdue (not approaching) when hours are overdue and date is approaching', () => {
    const inWeek = new Date(Date.now() + 7 * 86_400_000).toISOString().split('T')[0]
    const r = makeReminder({
      next_due_date: inWeek,   // approaching by date
      next_due_hours: 300,     // overdue by hours
    })
    expect(getReminderStatus(r, null, 301)).toBe('overdue')
  })

  it('returns approaching when hours are approaching and date is ok', () => {
    const farFuture = new Date(Date.now() + 365 * 86_400_000).toISOString().split('T')[0]
    const r = makeReminder({
      next_due_date: farFuture,
      next_due_hours: 300,
    })
    expect(getReminderStatus(r, null, 295)).toBe('approaching')
  })
})

// ── Calendar-only (no mileage/hours) ──────────────────────────────

describe('getReminderStatus — calendar only (no mileage/hours)', () => {
  it('returns ok when date is far in the future (more than 14 days)', () => {
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString().split('T')[0]
    const r = makeReminder({ next_due_date: future })
    expect(getReminderStatus(r)).toBe('ok')
  })

  it('returns approaching within 14 days', () => {
    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().split('T')[0]
    const r = makeReminder({ next_due_date: soon })
    expect(getReminderStatus(r)).toBe('approaching')
  })

  it('returns due on the exact due date', () => {
    const today = new Date().toISOString().split('T')[0]
    const r = makeReminder({ next_due_date: today })
    expect(getReminderStatus(r)).toBe('due')
  })

  it('returns overdue when date is in the past', () => {
    const past = new Date(Date.now() - 86_400_000).toISOString().split('T')[0]
    const r = makeReminder({ next_due_date: past })
    expect(getReminderStatus(r)).toBe('overdue')
  })

  it('ignores mileage/hours args when reminder has only next_due_date', () => {
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString().split('T')[0]
    const r = makeReminder({ next_due_date: future })
    // Passing mileage and hours should not affect the result
    expect(getReminderStatus(r, 50_000, 999)).toBe('ok')
  })
})

// ── Odometer sync decision — hours branch ─────────────────────────

describe('odometer sync decision — hours branch', () => {
  // Branch 1: no current hours → always accept
  it('accepts any reading when vehicle has no existing hours', () => {
    expect(shouldSyncHours({ currentHours: null, currentEstimated: false, newHours: 100, currentAsOf: null, newDate: '2024-01-01' })).toBe(true)
  })

  // Branch 2: current is estimated → newer confirmed replaces at any value
  it('replaces estimated hours with lower confirmed reading on same date', () => {
    expect(shouldSyncHours({ currentHours: 500, currentEstimated: true, newHours: 490, currentAsOf: '2024-06-01', newDate: '2024-06-01' })).toBe(true)
  })

  it('does not replace estimated hours with an older reading', () => {
    expect(shouldSyncHours({ currentHours: 500, currentEstimated: true, newHours: 490, currentAsOf: '2024-06-01', newDate: '2024-05-01' })).toBe(false)
  })

  // Branch 3: current is confirmed → only increase, only if more recent
  it('increases confirmed hours with a higher, more-recent reading', () => {
    expect(shouldSyncHours({ currentHours: 450, currentEstimated: false, newHours: 500, currentAsOf: '2024-01-01', newDate: '2024-06-01' })).toBe(true)
  })

  it('does not decrease confirmed hours even with a more-recent reading', () => {
    expect(shouldSyncHours({ currentHours: 500, currentEstimated: false, newHours: 450, currentAsOf: '2024-01-01', newDate: '2024-06-01' })).toBe(false)
  })

  it('does not update confirmed hours with an older reading even if higher', () => {
    expect(shouldSyncHours({ currentHours: 450, currentEstimated: false, newHours: 500, currentAsOf: '2024-06-01', newDate: '2024-01-01' })).toBe(false)
  })
})

// ── Helper: pure odometer sync decision ───────────────────────────
// Mirrors the three-branch SQL logic in log_service() and
// EditVehicleDialog — testable without a database connection.

interface SyncArgs {
  currentMileage: number | null
  currentEstimated: boolean
  newMileage: number
  currentAsOf: string | null  // YYYY-MM-DD
  newDate: string             // YYYY-MM-DD
}

function shouldSync({ currentMileage, currentEstimated, newMileage, currentAsOf, newDate }: SyncArgs): boolean {
  if (currentMileage === null) return true  // Branch 1

  if (currentEstimated) {
    // Branch 2: newer confirmed reading replaces estimate at any value
    if (currentAsOf === null) return true
    return newDate >= currentAsOf
  }

  // Branch 3: confirmed → only increase, only if more recent
  if (newMileage <= currentMileage) return false
  if (currentAsOf !== null && newDate < currentAsOf) return false
  return true
}

// Same 3-branch logic applied to engine hours.
interface SyncHoursArgs {
  currentHours: number | null
  currentEstimated: boolean
  newHours: number
  currentAsOf: string | null
  newDate: string
}

function shouldSyncHours({ currentHours, currentEstimated, newHours, currentAsOf, newDate }: SyncHoursArgs): boolean {
  if (currentHours === null) return true  // Branch 1

  if (currentEstimated) {
    // Branch 2: newer confirmed reading replaces estimate at any value
    if (currentAsOf === null) return true
    return newDate >= currentAsOf
  }

  // Branch 3: confirmed → only increase, only if more recent
  if (newHours <= currentHours) return false
  if (currentAsOf !== null && newDate < currentAsOf) return false
  return true
}

// ── hasStaleUsageThreshold ─────────────────────────────────────────────────
// Detects when advancing a combined reminder calendar-only would leave a usage
// threshold unchanged (and potentially overdue) because no reading was provided.

describe('hasStaleUsageThreshold', () => {
  it('returns false when reminder is null', () => {
    expect(hasStaleUsageThreshold(null, 'miles', false)).toBe(false)
  })

  it('returns false when reminder is undefined', () => {
    expect(hasStaleUsageThreshold(undefined, 'miles', false)).toBe(false)
  })

  it('returns false when mileage reading is provided', () => {
    const r = makeReminder({ interval_miles: 5000 })
    expect(hasStaleUsageThreshold(r, 'miles', true)).toBe(false)
  })

  it('returns false when hours reading is provided', () => {
    const r = makeReminder({ interval_hours: 50 })
    expect(hasStaleUsageThreshold(r, 'hours', true)).toBe(false)
  })

  it('returns true for recurring miles interval with no mileage reading', () => {
    const r = makeReminder({ interval_miles: 5000 })
    expect(hasStaleUsageThreshold(r, 'miles', false)).toBe(true)
  })

  it('returns false for miles unit when interval_miles is null (no recurring schedule)', () => {
    const r = makeReminder({ interval_miles: null, next_due_mileage: 50_000 })
    expect(hasStaleUsageThreshold(r, 'miles', false)).toBe(false)
  })

  it('returns true for recurring hours interval with no hours reading', () => {
    const r = makeReminder({ interval_hours: 50 })
    expect(hasStaleUsageThreshold(r, 'hours', false)).toBe(true)
  })

  it('returns false for hours unit when interval_hours is null (no recurring schedule)', () => {
    const r = makeReminder({ interval_hours: null, next_due_hours: 300 })
    expect(hasStaleUsageThreshold(r, 'hours', false)).toBe(false)
  })

  it('returns false for a date-only reminder (no usage intervals, no reading needed)', () => {
    const r = makeReminder({ interval_miles: null, interval_hours: null, interval_months: 6 })
    expect(hasStaleUsageThreshold(r, 'miles', false)).toBe(false)
    expect(hasStaleUsageThreshold(r, 'hours', false)).toBe(false)
  })

  it('handles combined reminder: stale for the missing unit only', () => {
    // Both intervals set — user provided hours but not miles
    const r = makeReminder({ interval_miles: 5000, interval_hours: 50 })
    expect(hasStaleUsageThreshold(r, 'miles', false)).toBe(true)   // miles missing → stale
    expect(hasStaleUsageThreshold(r, 'hours', true)).toBe(false)   // hours provided → not stale
  })

  it('returns false for all units when both readings are provided', () => {
    const r = makeReminder({ interval_miles: 5000, interval_hours: 50 })
    expect(hasStaleUsageThreshold(r, 'miles', true)).toBe(false)
    expect(hasStaleUsageThreshold(r, 'hours', true)).toBe(false)
  })
})
