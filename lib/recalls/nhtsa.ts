import type { ProviderResult, RecallResult } from './types'

// NHTSA ReportReceivedDate is DD/MM/YYYY, confirmed from live API samples:
//   15 of 28 dates sampled have first segment > 12 (e.g. "28/08/2019", "16/01/2026"),
//   which is unambiguous proof of DD/MM/YYYY ordering throughout the API.
//
// For dates where the first segment is ≤ 12 (ambiguous), DD/MM/YYYY is applied
// consistently with the confirmed samples. The parsed date is validated to ensure
// JavaScript's Date did not silently overflow (e.g. day=32 rolls to the next month).
// If parsing produces an invalid or overflowed date, the raw string is returned.
function parseNhtsaDate(raw: string): string {
  if (!raw) return ''
  const parts = raw.split('/')
  if (parts.length !== 3) return raw

  const [p1, p2, p3] = parts
  const dd = Number(p1)
  const mm = Number(p2)
  const yyyy = Number(p3)

  if (isNaN(dd) || isNaN(mm) || isNaN(yyyy) || yyyy < 1960 || yyyy > 2100) return raw
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return raw

  const d = new Date(yyyy, mm - 1, dd)
  // Guard against JS Date overflow: new Date(2020, 1, 30) silently becomes Mar 1.
  if (isNaN(d.getTime()) || d.getMonth() !== mm - 1 || d.getDate() !== dd) return raw

  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

interface NhtsaRawRecall {
  NHTSACampaignNumber: string
  ReportReceivedDate: string
  Component: string
  Summary: string
  Consequence: string
  Remedy: string
  Manufacturer: string
  ModelYear: string
  Make: string
  Model: string
  parkIt: boolean
  parkOutSide: boolean
}

export async function fetchNhtsaRecalls(
  make: string,
  model: string,
  year: number,
): Promise<ProviderResult> {
  const params = new URLSearchParams({
    make: make.trim(),
    model: model.trim(),
    modelYear: String(year),
  })
  const url = `https://api.nhtsa.gov/recalls/recallsByVehicle?${params}`

  let raw: NhtsaRawRecall[]
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    const res = await fetch(url, {
      signal: controller.signal,
      next: { revalidate: 3600 },
    })
    clearTimeout(timeout)

    if (res.status === 400) {
      // NHTSA returns 400 when the make/model combination is not found in their
      // vehicle database. This is NOT a successful zero-result response — it means
      // the query could not be executed against a known vehicle record.
      // The user should verify their make/model matches NHTSA's exact naming.
      return { provider: 'nhtsa', status: 'vehicle_not_found', recalls: [] }
    }
    if (res.status === 429) {
      return { provider: 'nhtsa', status: 'rate_limited', recalls: [] }
    }
    if (!res.ok) {
      return { provider: 'nhtsa', status: 'provider_error', recalls: [] }
    }

    const json = await res.json()
    raw = Array.isArray(json.results) ? json.results : []
  } catch {
    return { provider: 'nhtsa', status: 'provider_error', recalls: [] }
  }

  const recalls: RecallResult[] = raw.map(r => ({
    id: r.NHTSACampaignNumber,
    provider: 'nhtsa' as const,
    // NHTSA results are always exact year/make/model matches; the recall may
    // still not apply to a specific VIN — users must verify on NHTSA.gov.
    confidence: 'model_match' as const,
    title: r.Component || 'Safety Recall',
    date: parseNhtsaDate(r.ReportReceivedDate),
    manufacturer: r.Manufacturer || make,
    affectedProducts: [r.ModelYear, r.Make, r.Model].filter(Boolean).join(' '),
    hazard: r.Consequence || '',
    remedy: r.Remedy || '',
    sourceUrl: `https://www.nhtsa.gov/recalls?nhtsaId=${r.NHTSACampaignNumber}`,
  }))

  return { provider: 'nhtsa', status: 'ok', recalls }
}
