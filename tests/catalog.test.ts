import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchMakes, fetchModels, VPIC_MAKE_TYPES } from '../lib/catalog/vpic'
import { getModelSupplement, MODEL_SUPPLEMENTS } from '../lib/catalog/model-supplement'
import type { VehicleType } from '../types'

// ── VPIC_MAKE_TYPES coverage ─────────────────────────────────────────────────

describe('VPIC_MAKE_TYPES — coverage', () => {
  const catalogTypes: VehicleType[] = ['car', 'truck', 'suv', 'motorcycle', 'dirt_bike', 'atv', 'utv']
  const manualTypes: VehicleType[] = [
    'snowmobile', 'boat', 'personal_watercraft',
    'riding_mower', 'push_mower', 'generator',
    'trailer', 'camp_trailer', 'other',
  ]

  catalogTypes.forEach((t) => {
    it(`${t} has at least one vPIC type`, () => {
      expect(VPIC_MAKE_TYPES[t]).toBeDefined()
      expect((VPIC_MAKE_TYPES[t] as string[]).length).toBeGreaterThan(0)
    })
  })

  manualTypes.forEach((t) => {
    it(`${t} is absent from vPIC (manual entry)`, () => {
      expect(VPIC_MAKE_TYPES[t]).toBeUndefined()
    })
  })

  it('suv maps to both MPV and Truck', () => {
    expect(VPIC_MAKE_TYPES.suv).toContain('MPV')
    expect(VPIC_MAKE_TYPES.suv).toContain('Truck')
  })
})

// ── fetchMakes ───────────────────────────────────────────────────────────────

function makeMakesResponse(makes: Array<{ MakeId: number; MakeName: string }>) {
  return {
    ok: true,
    json: async () => ({ Results: makes }),
  }
}

describe('fetchMakes — deduplication and sorting', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns empty array for a non-catalog type', async () => {
    const result = await fetchMakes('snowmobile')
    expect(result).toEqual([])
  })

  it('deduplicates makes with the same MakeId across vPIC type calls (SUV)', async () => {
    // MPV returns Toyota(1) + Honda(2), Truck returns Ford(3) + Toyota(1)
    // Toyota should appear only once.
    let callCount = 0
    vi.stubGlobal('fetch', async () => {
      callCount++
      if (callCount === 1) {
        return makeMakesResponse([
          { MakeId: 1, MakeName: 'Toyota' },
          { MakeId: 2, MakeName: 'Honda' },
        ])
      }
      return makeMakesResponse([
        { MakeId: 3, MakeName: 'Ford' },
        { MakeId: 1, MakeName: 'Toyota' },
      ])
    })
    const result = await fetchMakes('suv')
    const toyotaCount = result.filter((m) => m.name === 'Toyota').length
    expect(toyotaCount).toBe(1)
    expect(result).toHaveLength(3)
  })

  it('returns makes sorted alphabetically', async () => {
    vi.stubGlobal('fetch', async () =>
      makeMakesResponse([
        { MakeId: 3, MakeName: 'Ford' },
        { MakeId: 1, MakeName: 'Acura' },
        { MakeId: 2, MakeName: 'BMW' },
      ])
    )
    const result = await fetchMakes('car')
    expect(result.map((m) => m.name)).toEqual(['Acura', 'BMW', 'Ford'])
  })

  it('returns empty array on network failure', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('network') })
    const result = await fetchMakes('car')
    expect(result).toEqual([])
  })

  it('returns empty array on non-ok response', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false }))
    const result = await fetchMakes('truck')
    expect(result).toEqual([])
  })

  it('returns empty array when Results is missing', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({}) }))
    const result = await fetchMakes('car')
    expect(result).toEqual([])
  })
})

// ── fetchModels ──────────────────────────────────────────────────────────────

function makeModelsResponse(models: Array<{ Model_ID: number; Model_Name: string }>) {
  return {
    ok: true,
    json: async () => ({ Results: models }),
  }
}

describe('fetchModels — deduplication and sorting', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('deduplicates models with the same Model_ID', async () => {
    vi.stubGlobal('fetch', async () =>
      makeModelsResponse([
        { Model_ID: 1, Model_Name: 'F-150' },
        { Model_ID: 2, Model_Name: 'Ranger' },
        { Model_ID: 1, Model_Name: 'F-150' }, // duplicate
      ])
    )
    const result = await fetchModels('Ford', 2022)
    const f150Count = result.filter((m) => m.name === 'F-150').length
    expect(f150Count).toBe(1)
    expect(result).toHaveLength(2)
  })

  it('returns models sorted alphabetically', async () => {
    vi.stubGlobal('fetch', async () =>
      makeModelsResponse([
        { Model_ID: 3, Model_Name: 'Tacoma' },
        { Model_ID: 1, Model_Name: '4Runner' },
        { Model_ID: 2, Model_Name: 'Camry' },
      ])
    )
    const result = await fetchModels('Toyota', 2021)
    expect(result.map((m) => m.name)).toEqual(['4Runner', 'Camry', 'Tacoma'])
  })

  it('returns empty array on network failure', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('network') })
    const result = await fetchModels('Toyota', 2021)
    expect(result).toEqual([])
  })

  it('returns empty array on non-ok response', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false }))
    const result = await fetchModels('Ford', 2020)
    expect(result).toEqual([])
  })
})

// ── getModelSupplement ───────────────────────────────────────────────────────

describe('getModelSupplement — GM truck sub-models', () => {
  it('Sierra → Sierra 1500 for year 2020', () => {
    const result = getModelSupplement('GMC', 'Sierra', 2020)
    expect(result).not.toBeNull()
    expect(result).toContain('Sierra 1500')
  })

  it('Sierra HD → Sierra 2500HD and Sierra 3500HD for year 2020', () => {
    const result = getModelSupplement('GMC', 'Sierra HD', 2020)
    expect(result).not.toBeNull()
    expect(result).toContain('Sierra 2500HD')
    expect(result).toContain('Sierra 3500HD')
  })

  it('Silverado → Silverado 1500 for year 2022', () => {
    const result = getModelSupplement('Chevrolet', 'Silverado', 2022)
    expect(result).not.toBeNull()
    expect(result).toContain('Silverado 1500')
  })

  it('Silverado HD → Silverado 2500HD and Silverado 3500HD for year 2022', () => {
    const result = getModelSupplement('Chevrolet', 'Silverado HD', 2022)
    expect(result).not.toBeNull()
    expect(result).toContain('Silverado 2500HD')
    expect(result).toContain('Silverado 3500HD')
  })

  it('Sierra HD does NOT trigger before 2001 (year-specific guard)', () => {
    const result = getModelSupplement('GMC', 'Sierra HD', 1998)
    expect(result).toBeNull()
  })

  it('Silverado does NOT trigger before 1999', () => {
    const result = getModelSupplement('Chevrolet', 'Silverado', 1998)
    expect(result).toBeNull()
  })

  it('Silverado HD does NOT trigger before 2001', () => {
    const result = getModelSupplement('Chevrolet', 'Silverado HD', 2000)
    expect(result).toBeNull()
  })

  it('Sierra (GMC) triggers for year 1990 (available since 1988)', () => {
    const result = getModelSupplement('GMC', 'Sierra', 1990)
    expect(result).not.toBeNull()
    expect(result).toContain('Sierra 1500')
  })

  it('no supplement for Toyota Tacoma', () => {
    expect(getModelSupplement('Toyota', 'Tacoma', 2020)).toBeNull()
  })

  it('no supplement for Ford F-150', () => {
    expect(getModelSupplement('Ford', 'F-150', 2022)).toBeNull()
  })

  it('no supplement for Honda Civic', () => {
    expect(getModelSupplement('Honda', 'Civic', 2020)).toBeNull()
  })

  it('make comparison is case-insensitive', () => {
    const lower = getModelSupplement('gmc', 'Sierra', 2020)
    const upper = getModelSupplement('GMC', 'Sierra', 2020)
    expect(lower).toEqual(upper)
  })

  it('MODEL_SUPPLEMENTS covers all four expected keys', () => {
    const keys = Object.keys(MODEL_SUPPLEMENTS)
    expect(keys).toContain('GMC|Sierra')
    expect(keys).toContain('GMC|Sierra HD')
    expect(keys).toContain('CHEVROLET|Silverado')
    expect(keys).toContain('CHEVROLET|Silverado HD')
  })
})

// ── Dependent selection clearing contract ───────────────────────────────────
// These tests document the expected behavior when upstream fields change.
// They verify the helper values directly, not the React components.

describe('catalog — dependent field contracts', () => {
  it('fetchMakes returns different results for car vs motorcycle (type routing)', async () => {
    let lastUrl = ''
    vi.stubGlobal('fetch', async (url: string) => {
      lastUrl = url
      return makeModelsResponse([])
    })
    await fetchMakes('car')
    expect(lastUrl).toContain('Passenger%20Car')
    await fetchMakes('motorcycle')
    expect(lastUrl).toContain('Motorcycle')
    vi.restoreAllMocks()
  })

  it('fetchMakes for dirt_bike uses Motorcycle type (same as motorcycle)', async () => {
    let lastUrl = ''
    vi.stubGlobal('fetch', async (url: string) => {
      lastUrl = url
      return makeModelsResponse([])
    })
    await fetchMakes('dirt_bike')
    expect(lastUrl).toContain('Motorcycle')
    vi.restoreAllMocks()
  })

  it('fetchMakes returns empty for non-catalog type without calling fetch', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    const result = await fetchMakes('generator')
    expect(result).toEqual([])
    expect(spy).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })
})

// ── API route params validation (unit-level) ──────────────────────────────────
// The route handlers use VPIC_MAKE_TYPES to validate vehicleType.

describe('catalog API route param validation contract', () => {
  it('VPIC_MAKE_TYPES rejects unknown vehicleType string', () => {
    const unknownType = 'spaceship' as VehicleType
    expect(unknownType in VPIC_MAKE_TYPES).toBe(false)
  })

  it('VPIC_MAKE_TYPES accepts all catalog vehicle types', () => {
    const types: VehicleType[] = ['car', 'truck', 'suv', 'motorcycle', 'dirt_bike', 'atv', 'utv']
    for (const t of types) {
      expect(t in VPIC_MAKE_TYPES).toBe(true)
    }
  })
})
