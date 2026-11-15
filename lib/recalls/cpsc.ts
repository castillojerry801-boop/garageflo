import type { ProviderResult, RecallResult } from './types'

// CPSC saferproducts.gov API: text filters (ManufacturerName, Keyword) do NOT work
// server-side — the endpoint returns all records for any text param. Only date
// filters are effective. We fetch a fixed-year window and filter locally.
//
// Confirmed from live API testing (2026-11-15): keyword params return full dataset.
//
// Window size rationale (verified from live data 2026-11-15):
//   5-year window:  ~2,000 records, ~6MB
//  10-year window:  ~3,450 records, ~9.3MB  ← chosen
//  full history:   ~10,000 records, ~27MB
//
// A 10-year window is used because safety recalls on durable equipment (generators,
// ATVs, snowmobiles, lawnmowers) remain relevant well beyond 5 years of purchase.
// A 2016 generator or 2018 ATV may have a 2019 or 2020 recall still affecting it.
// Live sample: 360 equipment recalls exist in the 5–10 year window alone.
// The 24-hour Next.js fetch cache amortizes the ~9MB download.
export const CPSC_SEARCH_YEARS = 10

interface CpscProduct {
  Name: string
  Description: string
  Model: string
  Type: string
  CategoryID: string
  NumberOfUnits: string
}

interface CpscManufacturer {
  Name: string
  CompanyID: string
}

interface CpscHazard {
  Name: string
}

interface CpscRemedy {
  Name: string
}

interface CpscRawRecall {
  RecallID: number
  RecallNumber: string
  RecallDate: string   // ISO "2023-08-03T00:00:00"
  Title: string
  Description: string
  URL: string
  Products: CpscProduct[]
  Manufacturers: CpscManufacturer[]
  Hazards: CpscHazard[]
  Remedies: CpscRemedy[]
}

function parseCpscDate(raw: string): string {
  if (!raw) return ''
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Match manufacturer name against Title and Manufacturers[].Name (Manufacturers is often empty).
function matchesManufacturer(recall: CpscRawRecall, make: string): boolean {
  const makeLower = make.toLowerCase()
  const titleLower = recall.Title.toLowerCase()
  if (titleLower.includes(makeLower)) return true
  return recall.Manufacturers.some(m => m.Name.toLowerCase().includes(makeLower))
}

// Match product type against Title and Products[].Name.
// Products[].Type is unreliable (often empty) — confirmed from live API data.
function matchesProductType(recall: CpscRawRecall, keywords: string[]): boolean {
  if (keywords.length === 0) return true  // 'other' type — accept any manufacturer match
  const titleLower = recall.Title.toLowerCase()
  const productNames = recall.Products.map(p => p.Name.toLowerCase()).join(' ')
  return keywords.some(kw => titleLower.includes(kw) || productNames.includes(kw))
}

// 'model_match' = both manufacturer AND product type found in title.
// 'possible'    = manufacturer match but type only found in product names (weaker signal).
function matchConfidence(
  recall: CpscRawRecall,
  make: string,
  keywords: string[],
): 'model_match' | 'possible' {
  if (keywords.length === 0) return 'possible'
  const titleLower = recall.Title.toLowerCase()
  const makeLower = make.toLowerCase()
  const manufacturerInTitle = titleLower.includes(makeLower) ||
    recall.Manufacturers.some(m => m.Name.toLowerCase().includes(makeLower))
  const typeInTitle = keywords.some(kw => titleLower.includes(kw))
  return manufacturerInTitle && typeInTitle ? 'model_match' : 'possible'
}

export async function fetchCpscRecalls(
  make: string,
  typeKeywords: string[],
): Promise<ProviderResult> {
  const sinceYear = new Date().getFullYear() - CPSC_SEARCH_YEARS
  const url = `https://www.saferproducts.gov/RestWebServices/Recall?format=json&RecallDateStart=${sinceYear}-01-01`

  let raw: CpscRawRecall[]
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    // 24-hour cache: amortizes the ~9MB download across all users for a given day.
    const res = await fetch(url, {
      signal: controller.signal,
      next: { revalidate: 86400 },
    })
    clearTimeout(timeout)

    if (res.status === 429) {
      return { provider: 'cpsc', status: 'rate_limited', recalls: [], searchFromYear: sinceYear }
    }
    if (!res.ok) {
      return { provider: 'cpsc', status: 'provider_error', recalls: [], searchFromYear: sinceYear }
    }

    raw = await res.json()
    if (!Array.isArray(raw)) {
      return { provider: 'cpsc', status: 'provider_error', recalls: [], searchFromYear: sinceYear }
    }
  } catch {
    return { provider: 'cpsc', status: 'provider_error', recalls: [], searchFromYear: sinceYear }
  }

  // Filter locally: require both manufacturer AND product type match.
  const matched = raw.filter(
    r => matchesManufacturer(r, make) && matchesProductType(r, typeKeywords),
  )

  const recalls: RecallResult[] = matched.map(r => ({
    id: r.RecallNumber,
    provider: 'cpsc' as const,
    confidence: matchConfidence(r, make, typeKeywords),
    title: r.Title,
    date: parseCpscDate(r.RecallDate),
    manufacturer: r.Manufacturers[0]?.Name || make,
    affectedProducts: r.Products.map(p => p.Name).filter(Boolean).join('; ') || r.Title,
    hazard: r.Hazards[0]?.Name || '',
    remedy: r.Remedies[0]?.Name || '',
    sourceUrl: r.URL,
  }))

  return { provider: 'cpsc', status: 'ok', recalls, searchFromYear: sinceYear }
}
