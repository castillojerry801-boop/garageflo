export { cn } from "cn"

// Parses a YYYY-MM-DD date string as local midnight.
// new Date('YYYY-MM-DD') parses as UTC midnight, which shifts the displayed
// date backward by one day in any timezone west of UTC.
export function parseDateLocal(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

// Formats a YYYY-MM-DD date string for display using local timezone.
export function formatDateOnly(
  dateStr: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' },
): string {
  return parseDateLocal(dateStr).toLocaleDateString('en-US', options)
}

// Returns today's calendar date as a YYYY-MM-DD string in local timezone.
// Use instead of new Date().toISOString().split('T')[0], which returns UTC today.
export function todayLocalString(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
