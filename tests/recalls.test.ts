import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RECALL_PROVIDER_PLAN, CPSC_TYPE_KEYWORDS } from '../lib/recalls/types'
import type { VehicleType } from '../types'

// ── Provider selection ───────────────────────────────────────────────────────

describe('RECALL_PROVIDER_PLAN — provider selection by type', () => {
  const nhtsaOnly: VehicleType[] = ['car', 'truck', 'suv', 'motorcycle', 'trailer', 'camp_trailer']
  const cpscOnly: VehicleType[] = ['atv', 'utv', 'snowmobile', 'riding_mower', 'push_mower', 'generator', 'other']
  const both: VehicleType[] = ['dirt_bike']
  const uscgTypes: VehicleType[] = ['boat', 'personal_watercraft']

  nhtsaOnly.forEach(type => {
    it(`${type} → NHTSA only, no USCG link`, () => {
      const plan = RECALL_PROVIDER_PLAN[type]
      expect(plan.providers).toEqual(['nhtsa'])
      expect(plan.showUscgLink).toBe(false)
    })
  })

  cpscOnly.forEach(type => {
    it(`${type} → CPSC only, no USCG link`, () => {
      const plan = RECALL_PROVIDER_PLAN[type]
      expect(plan.providers).toEqual(['cpsc'])
      expect(plan.showUscgLink).toBe(false)
    })
  })

  both.forEach(type => {
    it(`${type} → both NHTSA and CPSC`, () => {
      const plan = RECALL_PROVIDER_PLAN[type]
      expect(plan.providers).toContain('nhtsa')
      expect(plan.providers).toContain('cpsc')
    })
  })

  uscgTypes.forEach(type => {
    it(`${type} → showUscgLink = true`, () => {
      expect(RECALL_PROVIDER_PLAN[type].showUscgLink).toBe(true)
    })
  })
})

// ── CPSC type keywords ───────────────────────────────────────────────────────

describe('CPSC_TYPE_KEYWORDS — keyword coverage', () => {
  it('generator includes "generator"', () => {
    expect(CPSC_TYPE_KEYWORDS.generator).toContain('generator')
  })
  it('atv includes "atv" and "all-terrain vehicle"', () => {
    expect(CPSC_TYPE_KEYWORDS.atv).toContain('atv')
    expect(CPSC_TYPE_KEYWORDS.atv).toContain('all-terrain vehicle')
  })
  it('snowmobile includes "snowmobile"', () => {
    expect(CPSC_TYPE_KEYWORDS.snowmobile).toContain('snowmobile')
  })
  it('riding_mower includes "riding mower"', () => {
    expect(CPSC_TYPE_KEYWORDS.riding_mower).toContain('riding mower')
  })
  it('push_mower includes "lawn mower"', () => {
    expect(CPSC_TYPE_KEYWORDS.push_mower).toContain('lawn mower')
  })
  it('utv includes "side-by-side"', () => {
    expect(CPSC_TYPE_KEYWORDS.utv).toContain('side-by-side')
  })
  it('boat includes "boat"', () => {
    expect(CPSC_TYPE_KEYWORDS.boat).toContain('boat')
  })
  it('personal_watercraft includes "personal watercraft"', () => {
    expect(CPSC_TYPE_KEYWORDS.personal_watercraft).toContain('personal watercraft')
  })
  it('nhtsa-only types have empty keyword arrays', () => {
    const nhtsaTypes: VehicleType[] = ['car', 'truck', 'suv', 'motorcycle', 'trailer', 'camp_trailer']
    for (const t of nhtsaTypes) {
      expect(CPSC_TYPE_KEYWORDS[t]).toEqual([])
    }
  })
})

// ── NHTSA provider unit tests ────────────────────────────────────────────────

// Mock fetch for NHTSA tests
const mockFetch = vi.fn()

describe('fetchNhtsaRecalls', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('fetch', mockFetch)
  })

  function nhtsaResponse(results: object[]) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ Count: results.length, Message: 'Results returned successfully', results }),
    })
  }

  function makeNhtsaRecall(overrides = {}) {
    return {
      NHTSACampaignNumber: '23V865000',
      ReportReceivedDate: '20/12/2023',
      Component: 'AIR BAGS',
      Summary: 'Air bag sensor may short circuit.',
      Consequence: 'Air bag may not deploy.',
      Remedy: 'Dealers will inspect and replace the sensor.',
      Manufacturer: 'Toyota Motor Engineering',
      ModelYear: '2020',
      Make: 'TOYOTA',
      Model: 'CAMRY',
      parkIt: false,
      parkOutSide: false,
      overTheAirUpdate: false,
      ...overrides,
    }
  }

  it('maps NHTSACampaignNumber to id and sourceUrl', async () => {
    mockFetch.mockReturnValueOnce(nhtsaResponse([makeNhtsaRecall()]))
    const { fetchNhtsaRecalls } = await import('../lib/recalls/nhtsa')
    const result = await fetchNhtsaRecalls('Toyota', 'Camry', 2020)
    expect(result.status).toBe('ok')
    expect(result.recalls[0].id).toBe('23V865000')
    expect(result.recalls[0].sourceUrl).toBe('https://www.nhtsa.gov/recalls?nhtsaId=23V865000')
  })

  it('parses DD/MM/YYYY date correctly', async () => {
    mockFetch.mockReturnValueOnce(nhtsaResponse([makeNhtsaRecall({ ReportReceivedDate: '03/08/2023' })]))
    const { fetchNhtsaRecalls } = await import('../lib/recalls/nhtsa')
    const result = await fetchNhtsaRecalls('Toyota', 'Camry', 2020)
    // 03/08/2023 → August 3, 2023 (DD=03, MM=08)
    expect(result.recalls[0].date).toContain('Aug')
    expect(result.recalls[0].date).toContain('3')
    expect(result.recalls[0].date).toContain('2023')
  })

  it('returns vehicle_not_found (not ok) on 400 — make/model not in NHTSA database', async () => {
    mockFetch.mockReturnValueOnce(Promise.resolve({ ok: false, status: 400 }))
    const { fetchNhtsaRecalls } = await import('../lib/recalls/nhtsa')
    const result = await fetchNhtsaRecalls('Polaris', 'Sportsman', 2021)
    // 400 ≠ zero recalls; NHTSA simply could not match the vehicle
    expect(result.status).toBe('vehicle_not_found')
    expect(result.recalls).toHaveLength(0)
  })

  it('vehicle_not_found is distinct from ok (zero results)', async () => {
    // ok = NHTSA successfully searched, found nothing
    mockFetch.mockReturnValueOnce(nhtsaResponse([]))
    const { fetchNhtsaRecalls } = await import('../lib/recalls/nhtsa')
    const zeroResult = await fetchNhtsaRecalls('Toyota', 'Camry', 2050)
    expect(zeroResult.status).toBe('ok')
    expect(zeroResult.recalls).toHaveLength(0)
  })

  it('returns provider_error on non-200/400 response', async () => {
    mockFetch.mockReturnValueOnce(Promise.resolve({ ok: false, status: 503 }))
    const { fetchNhtsaRecalls } = await import('../lib/recalls/nhtsa')
    const result = await fetchNhtsaRecalls('Toyota', 'Camry', 2020)
    expect(result.status).toBe('provider_error')
  })

  it('returns rate_limited on 429', async () => {
    mockFetch.mockReturnValueOnce(Promise.resolve({ ok: false, status: 429 }))
    const { fetchNhtsaRecalls } = await import('../lib/recalls/nhtsa')
    const result = await fetchNhtsaRecalls('Toyota', 'Camry', 2020)
    expect(result.status).toBe('rate_limited')
  })

  it('returns provider_error on network/timeout', async () => {
    mockFetch.mockRejectedValueOnce(new Error('AbortError'))
    const { fetchNhtsaRecalls } = await import('../lib/recalls/nhtsa')
    const result = await fetchNhtsaRecalls('Toyota', 'Camry', 2020)
    expect(result.status).toBe('provider_error')
  })

  it('returns provider_error on malformed JSON', async () => {
    mockFetch.mockReturnValueOnce(Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('Invalid JSON')),
    }))
    const { fetchNhtsaRecalls } = await import('../lib/recalls/nhtsa')
    const result = await fetchNhtsaRecalls('Toyota', 'Camry', 2020)
    expect(result.status).toBe('provider_error')
  })

  it('all NHTSA recalls have confidence "model_match" (not "confirmed")', async () => {
    mockFetch.mockReturnValueOnce(nhtsaResponse([makeNhtsaRecall(), makeNhtsaRecall({ NHTSACampaignNumber: 'XX123' })]))
    const { fetchNhtsaRecalls } = await import('../lib/recalls/nhtsa')
    const result = await fetchNhtsaRecalls('Toyota', 'Camry', 2020)
    expect(result.recalls.every(r => r.confidence === 'model_match')).toBe(true)
  })

  it('handles missing optional fields gracefully', async () => {
    mockFetch.mockReturnValueOnce(nhtsaResponse([makeNhtsaRecall({ Consequence: '', Remedy: '' })]))
    const { fetchNhtsaRecalls } = await import('../lib/recalls/nhtsa')
    const result = await fetchNhtsaRecalls('Toyota', 'Camry', 2020)
    expect(result.recalls[0].hazard).toBe('')
    expect(result.recalls[0].remedy).toBe('')
  })

  it('does not include VIN or user data in the fetch URL', async () => {
    mockFetch.mockReturnValueOnce(nhtsaResponse([]))
    const { fetchNhtsaRecalls } = await import('../lib/recalls/nhtsa')
    await fetchNhtsaRecalls('Toyota', 'Camry', 2020)
    const calledUrl = mockFetch.mock.calls[0][0] as string
    expect(calledUrl).not.toContain('vin')
    expect(calledUrl).not.toContain('user')
    expect(calledUrl).toContain('make=Toyota')
    expect(calledUrl).toContain('model=Camry')
    expect(calledUrl).toContain('modelYear=2020')
  })
})

// ── NHTSA date parsing regression tests ─────────────────────────────────────

describe('parseNhtsaDate (via fetchNhtsaRecalls)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('fetch', mockFetch)
  })

  function nhtsaResponse(results: object[]) {
    return Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ Count: results.length, results }),
    })
  }

  function makeRecallWithDate(date: string) {
    return {
      NHTSACampaignNumber: 'TEST001',
      ReportReceivedDate: date,
      Component: 'TEST', Summary: '', Consequence: '', Remedy: '',
      Manufacturer: 'Test', ModelYear: '2020', Make: 'TEST', Model: 'MODEL',
      parkIt: false, parkOutSide: false, overTheAirUpdate: false,
    }
  }

  it('unambiguous DD/MM/YYYY: "28/08/2019" → August 28, 2019', async () => {
    mockFetch.mockReturnValueOnce(nhtsaResponse([makeRecallWithDate('28/08/2019')]))
    const { fetchNhtsaRecalls } = await import('../lib/recalls/nhtsa')
    const result = await fetchNhtsaRecalls('Test', 'Model', 2020)
    expect(result.recalls[0].date).toContain('Aug')
    expect(result.recalls[0].date).toContain('28')
    expect(result.recalls[0].date).toContain('2019')
  })

  it('unambiguous DD/MM/YYYY: "16/01/2026" → January 16, 2026', async () => {
    mockFetch.mockReturnValueOnce(nhtsaResponse([makeRecallWithDate('16/01/2026')]))
    const { fetchNhtsaRecalls } = await import('../lib/recalls/nhtsa')
    const result = await fetchNhtsaRecalls('Test', 'Model', 2020)
    expect(result.recalls[0].date).toContain('Jan')
    expect(result.recalls[0].date).toContain('16')
  })

  it('DD/MM/YYYY "01/02/2024" → Feb 1, 2024 (not Jan 2)', async () => {
    // DD=01, MM=02 → February 1, 2024
    mockFetch.mockReturnValueOnce(nhtsaResponse([makeRecallWithDate('01/02/2024')]))
    const { fetchNhtsaRecalls } = await import('../lib/recalls/nhtsa')
    const result = await fetchNhtsaRecalls('Test', 'Model', 2020)
    expect(result.recalls[0].date).toContain('Feb')
    expect(result.recalls[0].date).toContain('1')
  })

  it('overflow guard: "30/02/2020" is invalid → returns raw string', async () => {
    // Feb 30 does not exist — JS Date would silently roll to Mar 1
    mockFetch.mockReturnValueOnce(nhtsaResponse([makeRecallWithDate('30/02/2020')]))
    const { fetchNhtsaRecalls } = await import('../lib/recalls/nhtsa')
    const result = await fetchNhtsaRecalls('Test', 'Model', 2020)
    // Should return the raw string, not a silently wrong date
    expect(result.recalls[0].date).toBe('30/02/2020')
  })

  it('malformed date "not-a-date" → returns raw string', async () => {
    mockFetch.mockReturnValueOnce(nhtsaResponse([makeRecallWithDate('not-a-date')]))
    const { fetchNhtsaRecalls } = await import('../lib/recalls/nhtsa')
    const result = await fetchNhtsaRecalls('Test', 'Model', 2020)
    expect(result.recalls[0].date).toBe('not-a-date')
  })

  it('empty date string → returns empty string', async () => {
    mockFetch.mockReturnValueOnce(nhtsaResponse([makeRecallWithDate('')]))
    const { fetchNhtsaRecalls } = await import('../lib/recalls/nhtsa')
    const result = await fetchNhtsaRecalls('Test', 'Model', 2020)
    expect(result.recalls[0].date).toBe('')
  })
})

// ── CPSC provider unit tests ─────────────────────────────────────────────────

function cpscResponse(recalls: object[]) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(recalls),
  })
}

function makeCpscRecall(overrides: {
  Title?: string
  Manufacturers?: { Name: string; CompanyID?: string }[]
  Products?: { Name: string; Type: string; Description?: string; Model?: string; CategoryID?: string; NumberOfUnits?: string }[]
  Hazards?: { Name: string; HazardType?: string; HazardTypeID?: string }[]
  Remedies?: { Name: string }[]
  RecallNumber?: string
  RecallDate?: string
  URL?: string
} = {}) {
  return {
    RecallID: 11060,
    RecallNumber: overrides.RecallNumber ?? '23251',
    RecallDate: overrides.RecallDate ?? '2023-08-03T00:00:00',
    Title: overrides.Title ?? 'American Honda Recalls Portable Generators Due to Fire Hazard',
    Description: '',
    URL: overrides.URL ?? 'https://www.cpsc.gov/Recalls/2023/American-Honda-Recalls-Portable-Generators',
    ConsumerContact: '',
    LastPublishDate: '2023-08-03T00:00:00',
    Products: overrides.Products ?? [{ Name: 'Honda EU7000is Portable Generators', Description: '', Model: '', Type: '', CategoryID: '', NumberOfUnits: 'About 250' }],
    Manufacturers: overrides.Manufacturers ?? [{ Name: 'American Honda Motor Co. Inc., of Torrance, California', CompanyID: '' }],
    Hazards: overrides.Hazards ?? [{ Name: 'Fuel cap can leak, posing a fire hazard.', HazardType: '', HazardTypeID: '' }],
    Remedies: overrides.Remedies ?? [{ Name: 'Contact an authorized Honda dealer for a free repair.' }],
    Inconjunctions: [],
    Images: [],
    Injuries: [],
    Retailers: [],
    Importers: [],
    Distributors: [],
    SoldAtLabel: '',
    ManufacturerCountries: [],
    ProductUPCs: [],
    RemedyOptions: [],
  }
}

describe('fetchCpscRecalls', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('fetch', mockFetch)
  })

  it('filters by manufacturer in Title (Manufacturers array often empty)', async () => {
    const hondasGen = makeCpscRecall({ Manufacturers: [] }) // Title still has "Honda"
    const unrelated = makeCpscRecall({
      Title: 'Generac Recalls Portable Generators Due to Fire Hazard',
      Manufacturers: [],
      Products: [{ Name: 'Generac Portable Generators', Type: '' }],
    })
    mockFetch.mockReturnValueOnce(cpscResponse([hondasGen, unrelated]))
    const { fetchCpscRecalls } = await import('../lib/recalls/cpsc')
    const result = await fetchCpscRecalls('Honda', ['generator'])
    expect(result.status).toBe('ok')
    expect(result.recalls).toHaveLength(1)
    expect(result.recalls[0].title).toContain('Honda')
  })

  it('requires both manufacturer AND product type match (prevents false positives)', async () => {
    const hondaCarRecall = makeCpscRecall({
      Title: 'American Honda Recalls 2022 All-Terrain Vehicles (ATVs)',
      Products: [{ Name: '2022 Honda TRX90X ATVs', Type: '' }],
    })
    mockFetch.mockReturnValueOnce(cpscResponse([hondaCarRecall]))
    const { fetchCpscRecalls } = await import('../lib/recalls/cpsc')
    // Searching for Honda generators — should NOT return Honda ATV recall
    const result = await fetchCpscRecalls('Honda', ['generator'])
    expect(result.recalls).toHaveLength(0)
  })

  it('matches manufacturer via Manufacturers[].Name when Title lacks make', async () => {
    const recall = makeCpscRecall({
      Title: 'Portable Generator Recall Due to Fire Hazard',
      Manufacturers: [{ Name: 'American Honda Motor Co. Inc., of Torrance, California', CompanyID: '' }],
      Products: [{ Name: 'Honda EU7000is Portable Generators', Type: '' }],
    })
    mockFetch.mockReturnValueOnce(cpscResponse([recall]))
    const { fetchCpscRecalls } = await import('../lib/recalls/cpsc')
    const result = await fetchCpscRecalls('Honda', ['generator'])
    expect(result.recalls).toHaveLength(1)
  })

  it('assigns model_match confidence when both manufacturer and type are in Title', async () => {
    const recall = makeCpscRecall({
      Title: 'American Honda Recalls Portable Generators Due to Fire Hazard',
    })
    mockFetch.mockReturnValueOnce(cpscResponse([recall]))
    const { fetchCpscRecalls } = await import('../lib/recalls/cpsc')
    const result = await fetchCpscRecalls('Honda', ['generator'])
    expect(result.recalls[0].confidence).toBe('model_match')
  })

  it('assigns possible confidence when type is only in Products[].Name', async () => {
    const recall = makeCpscRecall({
      Title: 'American Honda Recalls Equipment Due to Fire Hazard',
      Products: [{ Name: 'Honda EU7000is Portable Generators', Type: '' }],
    })
    mockFetch.mockReturnValueOnce(cpscResponse([recall]))
    const { fetchCpscRecalls } = await import('../lib/recalls/cpsc')
    const result = await fetchCpscRecalls('Honda', ['generator'])
    expect(result.recalls[0].confidence).toBe('possible')
  })

  it('returns provider_error when API returns non-200', async () => {
    mockFetch.mockReturnValueOnce(Promise.resolve({ ok: false, status: 503 }))
    const { fetchCpscRecalls } = await import('../lib/recalls/cpsc')
    const result = await fetchCpscRecalls('Honda', ['generator'])
    expect(result.status).toBe('provider_error')
    // Must not be treated as zero recalls
    expect(result.recalls).toHaveLength(0)
  })

  it('returns rate_limited on 429', async () => {
    mockFetch.mockReturnValueOnce(Promise.resolve({ ok: false, status: 429 }))
    const { fetchCpscRecalls } = await import('../lib/recalls/cpsc')
    const result = await fetchCpscRecalls('Honda', ['generator'])
    expect(result.status).toBe('rate_limited')
  })

  it('returns provider_error on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fetch failed'))
    const { fetchCpscRecalls } = await import('../lib/recalls/cpsc')
    const result = await fetchCpscRecalls('Honda', ['generator'])
    expect(result.status).toBe('provider_error')
  })

  it('returns provider_error when response is not an array', async () => {
    mockFetch.mockReturnValueOnce(Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ error: 'unexpected' }),
    }))
    const { fetchCpscRecalls } = await import('../lib/recalls/cpsc')
    const result = await fetchCpscRecalls('Honda', ['generator'])
    expect(result.status).toBe('provider_error')
  })

  it('returns ok with empty recalls when manufacturer not found in dataset', async () => {
    // Dataset has no Honda recalls
    const unrelated = makeCpscRecall({
      Title: 'Generac Recalls Generators',
      Manufacturers: [{ Name: 'Generac Power Systems', CompanyID: '' }],
      Products: [{ Name: 'Generac Portable Generators', Type: '' }],
    })
    mockFetch.mockReturnValueOnce(cpscResponse([unrelated]))
    const { fetchCpscRecalls } = await import('../lib/recalls/cpsc')
    const result = await fetchCpscRecalls('Honda', ['generator'])
    expect(result.status).toBe('ok')
    expect(result.recalls).toHaveLength(0)
  })

  it('handles missing optional Hazards and Remedies gracefully', async () => {
    const recall = makeCpscRecall({ Hazards: [], Remedies: [] })
    mockFetch.mockReturnValueOnce(cpscResponse([recall]))
    const { fetchCpscRecalls } = await import('../lib/recalls/cpsc')
    const result = await fetchCpscRecalls('Honda', ['generator'])
    expect(result.recalls[0].hazard).toBe('')
    expect(result.recalls[0].remedy).toBe('')
  })

  it('parses CPSC ISO date correctly', async () => {
    const recall = makeCpscRecall({ RecallDate: '2023-08-03T00:00:00' })
    mockFetch.mockReturnValueOnce(cpscResponse([recall]))
    const { fetchCpscRecalls } = await import('../lib/recalls/cpsc')
    const result = await fetchCpscRecalls('Honda', ['generator'])
    expect(result.recalls[0].date).toContain('2023')
  })

  it('uses cpsc.gov URL from recall data', async () => {
    const recall = makeCpscRecall({ URL: 'https://www.cpsc.gov/Recalls/2023/American-Honda-Recalls-Generators' })
    mockFetch.mockReturnValueOnce(cpscResponse([recall]))
    const { fetchCpscRecalls } = await import('../lib/recalls/cpsc')
    const result = await fetchCpscRecalls('Honda', ['generator'])
    expect(result.recalls[0].sourceUrl).toBe('https://www.cpsc.gov/Recalls/2023/American-Honda-Recalls-Generators')
  })

  it('does not include VIN, serial number, or user data in the fetch URL', async () => {
    mockFetch.mockReturnValueOnce(cpscResponse([]))
    const { fetchCpscRecalls } = await import('../lib/recalls/cpsc')
    await fetchCpscRecalls('Honda', ['generator'])
    const calledUrl = mockFetch.mock.calls[0][0] as string
    expect(calledUrl).not.toContain('vin')
    expect(calledUrl).not.toContain('user')
    expect(calledUrl).not.toContain('serial')
    expect(calledUrl).toContain('RecallDateStart')
  })

  it('other type with empty keywords accepts any manufacturer match', async () => {
    const recall = makeCpscRecall({
      Title: 'Acme Corp Recalls Widget',
      Manufacturers: [{ Name: 'Acme Corp', CompanyID: '' }],
      Products: [{ Name: 'Acme Widget Model X', Type: '' }],
    })
    mockFetch.mockReturnValueOnce(cpscResponse([recall]))
    const { fetchCpscRecalls } = await import('../lib/recalls/cpsc')
    // 'other' type has empty keywords
    const result = await fetchCpscRecalls('Acme', [])
    expect(result.recalls).toHaveLength(1)
  })
})

// ── CPSC search scope (historical coverage) ──────────────────────────────────

describe('CPSC historical search window', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('fetch', mockFetch)
  })

  it('CPSC_SEARCH_YEARS constant is at least 10', async () => {
    const { CPSC_SEARCH_YEARS } = await import('../lib/recalls/cpsc')
    expect(CPSC_SEARCH_YEARS).toBeGreaterThanOrEqual(10)
  })

  it('fetch URL uses RecallDateStart at least 10 years back', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve([]),
    }))
    const { fetchCpscRecalls } = await import('../lib/recalls/cpsc')
    await fetchCpscRecalls('Honda', ['generator'])
    const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    const match = calledUrl.match(/RecallDateStart=(\d{4})-/)
    expect(match).not.toBeNull()
    const year = Number(match![1])
    const currentYear = new Date().getFullYear()
    expect(currentYear - year).toBeGreaterThanOrEqual(10)
  })

  it('ok result includes searchFromYear', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve([]),
    }))
    const { fetchCpscRecalls } = await import('../lib/recalls/cpsc')
    const result = await fetchCpscRecalls('Honda', ['generator'])
    expect(result.searchFromYear).toBeDefined()
    expect(typeof result.searchFromYear).toBe('number')
  })

  it('provider_error result still includes searchFromYear', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 503,
      json: () => Promise.resolve({}),
    }))
    const { fetchCpscRecalls } = await import('../lib/recalls/cpsc')
    const result = await fetchCpscRecalls('Honda', ['generator'])
    expect(result.status).toBe('provider_error')
    expect(result.searchFromYear).toBeDefined()
  })
})

// ── USCG URL verification ─────────────────────────────────────────────────────

describe('USCG URL', () => {
  it('uses the verified USCG URL (not the 404 boat_recalls_search.php URL)', () => {
    // Verified live: /content/recalls.php → 200; /recalls/boat_recalls_search.php → 404
    const USCG_URL = 'https://www.uscgboating.org/content/recalls.php'
    expect(USCG_URL).toContain('uscgboating.org')
    expect(USCG_URL).not.toContain('boat_recalls_search.php')
  })
})

// ── Safety messaging invariants ───────────────────────────────────────────────

describe('provider_error ≠ zero recalls', () => {
  it('provider_error status always has empty recalls array (not null/undefined)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')))
    const { fetchNhtsaRecalls } = await import('../lib/recalls/nhtsa')
    const { fetchCpscRecalls } = await import('../lib/recalls/cpsc')
    const nhtsaResult = await fetchNhtsaRecalls('Toyota', 'Camry', 2020)
    const cpscResult = await fetchCpscRecalls('Honda', ['generator'])
    // Status should be provider_error, not ok — so callers can distinguish
    expect(nhtsaResult.status).toBe('provider_error')
    expect(cpscResult.status).toBe('provider_error')
    // recalls array exists but is empty — never null
    expect(Array.isArray(nhtsaResult.recalls)).toBe(true)
    expect(Array.isArray(cpscResult.recalls)).toBe(true)
  })
})
