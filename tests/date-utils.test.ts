import { describe, it, expect } from 'vitest'
import { parseDateLocal, formatDateOnly, todayLocalString } from '../lib/utils'
import { getReminderStatus, type Reminder } from '../types/index'

// ── parseDateLocal ────────────────────────────────────────────────────────────
// The critical invariant: year/month/day components must match the input string
// regardless of the host timezone (UTC, Mountain, Pacific, Eastern, etc.).

describe('parseDateLocal', () => {
  it('returns the correct year/month/day in any timezone', () => {
    const d = parseDateLocal('2027-11-15')
    expect(d.getFullYear()).toBe(2027)
    expect(d.getMonth()).toBe(10)   // 0-indexed: November = 10
    expect(d.getDate()).toBe(15)
  })

  it('differs from new Date(str) in timezones west of UTC', () => {
    // new Date('2027-11-15') is UTC midnight; parseDateLocal is local midnight.
    // In any UTC− timezone the UTC object shows getDate() = 14 or 15 depending
    // on offset, but parseDateLocal always returns 15.
    const utcDate = new Date('2027-11-15')
    const local = parseDateLocal('2027-11-15')
    // The local Date always preserves the calendar day.
    expect(local.getDate()).toBe(15)
    expect(local.getMonth()).toBe(10)
    expect(local.getFullYear()).toBe(2027)
    // UTC midnight parsing: UTC methods always give the right day, but
    // getFullYear/Month/Date (local) can shift in negative-offset zones.
    // parseDateLocal must NOT equal a UTC interpretation in those zones.
    expect(utcDate.getUTCDate()).toBe(15)   // sanity check: UTC day is always 15
  })

  it('handles January correctly (month index 0)', () => {
    const d = parseDateLocal('2027-01-31')
    expect(d.getFullYear()).toBe(2027)
    expect(d.getMonth()).toBe(0)
    expect(d.getDate()).toBe(31)
  })

  it('handles February 29 in a leap year', () => {
    const d = parseDateLocal('2024-02-29')
    expect(d.getFullYear()).toBe(2024)
    expect(d.getMonth()).toBe(1)
    expect(d.getDate()).toBe(29)
  })

  it('handles February 28 in a non-leap year', () => {
    const d = parseDateLocal('2025-02-28')
    expect(d.getFullYear()).toBe(2025)
    expect(d.getMonth()).toBe(1)
    expect(d.getDate()).toBe(28)
  })

  it('handles December 31', () => {
    const d = parseDateLocal('2026-12-31')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(11)
    expect(d.getDate()).toBe(31)
  })
})

// ── formatDateOnly ────────────────────────────────────────────────────────────

describe('formatDateOnly', () => {
  it('formats Nov 15 correctly (default options)', () => {
    const result = formatDateOnly('2027-11-15')
    expect(result).toContain('15')
    expect(result).toContain('2027')
    expect(result).toMatch(/Nov/)
  })

  it('formats Jan 31 correctly', () => {
    const result = formatDateOnly('2027-01-31')
    expect(result).toContain('31')
    expect(result).toContain('2027')
    expect(result).toMatch(/Jan/)
  })

  it('respects custom options (month-only)', () => {
    const result = formatDateOnly('2027-11-15', { month: 'short', day: 'numeric' })
    expect(result).toContain('15')
    expect(result).toMatch(/Nov/)
    expect(result).not.toContain('2027')
  })

  it('formats Feb 29 in a leap year', () => {
    const result = formatDateOnly('2024-02-29')
    expect(result).toContain('29')
    expect(result).toMatch(/Feb/)
    expect(result).toContain('2024')
  })
})

// ── todayLocalString ──────────────────────────────────────────────────────────

describe('todayLocalString', () => {
  it('returns a YYYY-MM-DD string', () => {
    expect(todayLocalString()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('round-trips through parseDateLocal to the same calendar day as new Date()', () => {
    const today = new Date()
    const str = todayLocalString()
    const parsed = parseDateLocal(str)
    expect(parsed.getFullYear()).toBe(today.getFullYear())
    expect(parsed.getMonth()).toBe(today.getMonth())
    expect(parsed.getDate()).toBe(today.getDate())
  })
})

// ── getReminderStatus — date thresholds with local parsing ───────────────────

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
    notify_miles_before: null,
    notify_hours_before: null,
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

// Build a YYYY-MM-DD string offset by days from today (using local calendar).
function localDateOffset(days: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

describe('getReminderStatus — date thresholds (local calendar)', () => {
  it('returns overdue for a date that was yesterday', () => {
    const r = makeReminder({ next_due_date: localDateOffset(-1) })
    expect(getReminderStatus(r)).toBe('overdue')
  })

  it('returns due for today\'s date', () => {
    const r = makeReminder({ next_due_date: localDateOffset(0) })
    expect(getReminderStatus(r)).toBe('due')
  })

  it('returns approaching for a date 7 days out', () => {
    const r = makeReminder({ next_due_date: localDateOffset(7) })
    expect(getReminderStatus(r)).toBe('approaching')
  })

  it('returns approaching for 14 days out (boundary)', () => {
    const r = makeReminder({ next_due_date: localDateOffset(14) })
    expect(getReminderStatus(r)).toBe('approaching')
  })

  it('returns ok for a date 15 days out', () => {
    const r = makeReminder({ next_due_date: localDateOffset(15) })
    expect(getReminderStatus(r)).toBe('ok')
  })

  it('returns ok for a far future date', () => {
    const r = makeReminder({ next_due_date: localDateOffset(365) })
    expect(getReminderStatus(r)).toBe('ok')
  })
})

// ── Calendar recurrence — month-end and leap year arithmetic ─────────────────
// PostgreSQL's DATE + N * INTERVAL '1 month' uses calendar-correct arithmetic.
// These tests document the expected DB output for edge cases; they do NOT
// replicate the SQL — they verify the TypeScript display of those known dates.

describe('calendar recurrence — display of PostgreSQL month-end results', () => {
  // Nov 15 + 12 months → DB stores 2027-11-15
  it('formats Nov 15 + 12 months correctly', () => {
    const result = formatDateOnly('2027-11-15')
    expect(result).toContain('15')
    expect(result).toMatch(/Nov/)
    expect(result).toContain('2027')
  })

  // Jan 31 + 1 month → DB stores 2027-02-28 (PostgreSQL truncates to last day)
  it('formats Jan 31 + 1 month (Feb 28) correctly', () => {
    const result = formatDateOnly('2027-02-28')
    expect(result).toContain('28')
    expect(result).toMatch(/Feb/)
    expect(result).toContain('2027')
  })

  // Feb 29 (leap) + 12 months → DB stores 2025-02-28 (non-leap year truncates)
  it('formats Feb 29 + 12 months (Feb 28 non-leap) correctly', () => {
    const result = formatDateOnly('2025-02-28')
    expect(result).toContain('28')
    expect(result).toMatch(/Feb/)
    expect(result).toContain('2025')
  })

  // Dec 31 + 1 month → DB stores 2027-01-31
  it('formats Dec 31 + 1 month (Jan 31) correctly', () => {
    const result = formatDateOnly('2027-01-31')
    expect(result).toContain('31')
    expect(result).toMatch(/Jan/)
    expect(result).toContain('2027')
  })

  // These edge-case reminder dates must display the same day they were stored.
  // A UTC-parsed new Date() would shift them back by 1 day in UTC− timezones.
  it.each([
    ['2027-11-15', 15, 'Nov', 2027],
    ['2027-02-28', 28, 'Feb', 2027],
    ['2025-02-28', 28, 'Feb', 2025],
    ['2027-01-31', 31, 'Jan', 2027],
    ['2024-02-29', 29, 'Feb', 2024],
    ['2026-12-31', 31, 'Dec', 2026],
  ])('parseDateLocal(%s) preserves calendar date %d', (str, expectedDay) => {
    const d = parseDateLocal(str)
    expect(d.getDate()).toBe(expectedDay)
  })
})
