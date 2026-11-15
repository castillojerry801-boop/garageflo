import type { VehicleType } from '@/types'

export type RecallProvider = 'nhtsa' | 'cpsc'

// Which providers to query and whether the USCG deep-link should be shown.
export interface RecallProviderPlan {
  providers: RecallProvider[]
  showUscgLink: boolean
}

export interface RecallResult {
  id: string
  provider: RecallProvider
  // 'model_match' = NHTSA exact year/make/model, or CPSC manufacturer + type in Title
  // 'possible'    = manufacturer match, type only found in Products[].Name
  confidence: 'model_match' | 'possible'
  title: string
  date: string         // Human-readable, e.g. "Aug 3, 2023"
  manufacturer: string
  affectedProducts: string
  hazard: string
  remedy: string
  sourceUrl: string
}

export type ProviderStatus =
  | 'ok'                 // request succeeded (may have 0 results)
  | 'incomplete_data'    // vehicle is missing required fields
  | 'provider_error'     // network error, timeout, or unexpected HTTP status
  | 'rate_limited'       // HTTP 429
  | 'vehicle_not_found'  // NHTSA HTTP 400: make/model not in their database

export interface ProviderResult {
  provider: RecallProvider
  status: ProviderStatus
  recalls: RecallResult[]
  missingFields?: string[]   // present on incomplete_data
  searchFromYear?: number    // present on CPSC results; indicates scope of search
}

export interface RecallsApiResponse {
  vehicleId: string
  fetchedAt: string          // ISO timestamp
  providers: ProviderResult[]
  showUscgLink: boolean
}

// Which providers apply to each vehicle type (confirmed from live API testing).
export const RECALL_PROVIDER_PLAN: Record<VehicleType, RecallProviderPlan> = {
  car:                { providers: ['nhtsa'],        showUscgLink: false },
  truck:              { providers: ['nhtsa'],        showUscgLink: false },
  suv:                { providers: ['nhtsa'],        showUscgLink: false },
  motorcycle:         { providers: ['nhtsa'],        showUscgLink: false },
  dirt_bike:          { providers: ['nhtsa', 'cpsc'], showUscgLink: false },
  trailer:            { providers: ['nhtsa'],        showUscgLink: false },
  camp_trailer:       { providers: ['nhtsa'],        showUscgLink: false },
  atv:                { providers: ['cpsc'],         showUscgLink: false },
  utv:                { providers: ['cpsc'],         showUscgLink: false },
  snowmobile:         { providers: ['cpsc'],         showUscgLink: false },
  riding_mower:       { providers: ['cpsc'],         showUscgLink: false },
  push_mower:         { providers: ['cpsc'],         showUscgLink: false },
  generator:          { providers: ['cpsc'],         showUscgLink: false },
  boat:               { providers: ['cpsc'],         showUscgLink: true  },
  personal_watercraft:{ providers: ['cpsc'],         showUscgLink: true  },
  other:              { providers: ['cpsc'],         showUscgLink: false },
}

// Keywords used to filter CPSC results by product type.
// Checked against Title and Products[].Name (Type field is unreliable in CPSC data).
export const CPSC_TYPE_KEYWORDS: Record<VehicleType, string[]> = {
  car:                [],
  truck:              [],
  suv:                [],
  motorcycle:         [],
  trailer:            [],
  camp_trailer:       [],
  dirt_bike:          ['dirt bike', 'off-road motorcycle', 'motocross', 'enduro'],
  atv:                ['atv', 'all-terrain vehicle', 'all terrain vehicle', 'four-wheeler', 'four wheeler'],
  utv:                ['utv', 'side-by-side', 'rov ', 'recreational off-highway', 'utility task vehicle', 'ranger', 'rzr', 'general '],
  snowmobile:         ['snowmobile', 'snow machine', 'sled'],
  riding_mower:       ['riding mower', 'lawn tractor', 'zero-turn', 'zero turn', 'ride-on mower'],
  push_mower:         ['push mower', 'walk-behind mower', 'lawnmower', 'lawn mower', 'walk behind mower'],
  generator:          ['generator', 'portable power', 'inverter generator'],
  boat:               ['boat', 'motorboat', 'vessel'],
  personal_watercraft:['personal watercraft', 'pwc', 'jet ski', 'wave runner', 'waverunner'],
  other:              [],
}
