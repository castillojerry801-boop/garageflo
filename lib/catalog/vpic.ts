import type { VehicleType } from '@/types'

// vPIC vehicle type strings for the GetMakesForVehicleType endpoint.
// SUV uses two vPIC types (MPV + Truck) that must be merged and deduplicated.
// ATV, UTV, and dirt bike map to Motorcycle; coverage is partial.
// Snowmobile, boat, PWC, trailers, and equipment are absent from vPIC.
export const VPIC_MAKE_TYPES: Partial<Record<VehicleType, string[]>> = {
  car:        ['Passenger Car'],
  truck:      ['Truck'],
  suv:        ['MPV', 'Truck'],
  motorcycle: ['Motorcycle'],
  dirt_bike:  ['Motorcycle'],
  atv:        ['Motorcycle'],
  utv:        ['Motorcycle'],
}

export interface CatalogMake {
  id: number
  name: string
}

export interface CatalogModel {
  id: number
  name: string
}

interface VpicMakesResponse {
  Results: Array<{ MakeId: number; MakeName: string }>
}

interface VpicModelsResponse {
  Results: Array<{ Model_ID: number; Model_Name: string }>
}

const VPIC_BASE = 'https://vpic.nhtsa.dot.gov/api/vehicles'

async function fetchMakesForType(vpicType: string): Promise<CatalogMake[]> {
  const url = `${VPIC_BASE}/GetMakesForVehicleType/${encodeURIComponent(vpicType)}?format=json`
  const res = await fetch(url, { next: { revalidate: 86400 } })
  if (!res.ok) return []
  const data: VpicMakesResponse = await res.json()
  if (!Array.isArray(data?.Results)) return []
  return data.Results.map((r) => ({ id: r.MakeId, name: r.MakeName }))
}

// Returns deduplicated, alphabetically sorted makes for the given vehicle type.
// Returns empty array on network failure — callers must handle the outage case.
export async function fetchMakes(vehicleType: VehicleType): Promise<CatalogMake[]> {
  const vpicTypes = VPIC_MAKE_TYPES[vehicleType]
  if (!vpicTypes) return []

  try {
    const results = await Promise.all(vpicTypes.map(fetchMakesForType))
    const seen = new Set<number>()
    const merged: CatalogMake[] = []
    for (const list of results) {
      for (const make of list) {
        if (!seen.has(make.id)) {
          seen.add(make.id)
          merged.push(make)
        }
      }
    }
    return merged.sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

// Returns deduplicated, alphabetically sorted models for a given make+year pair.
// Returns empty array on network failure — callers must handle the outage case.
export async function fetchModels(make: string, year: number): Promise<CatalogModel[]> {
  const url = `${VPIC_BASE}/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}?format=json`
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    const data: VpicModelsResponse = await res.json()
    if (!Array.isArray(data?.Results)) return []

    const seen = new Set<number>()
    const models: CatalogModel[] = []
    for (const r of data.Results) {
      if (!seen.has(r.Model_ID)) {
        seen.add(r.Model_ID)
        models.push({ id: r.Model_ID, name: r.Model_Name })
      }
    }
    return models.sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}
