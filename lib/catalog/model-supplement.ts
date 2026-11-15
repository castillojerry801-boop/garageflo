// Static sub-model supplements for GM trucks where vPIC model names differ from
// the NHTSA recall API. vPIC returns "Sierra"/"Sierra HD" but the recall API
// requires "Sierra 1500"/"Sierra 2500HD"/"Sierra 3500HD". Same for Silverado.
//
// Year ranges sourced from NHTSA production data:
//   Sierra 1500: 1988–present
//   Sierra HD (2500HD/3500HD): introduced 2001 as distinct trim line
//   Silverado 1500: 1999–present
//   Silverado HD (2500HD/3500HD): 2001–present (prior to 2001 it was "C/K 2500/3500")

export interface ModelSupplement {
  // Sub-models to present INSTEAD OF the base vPIC model name.
  replaces: string[]
  // The model year range where these sub-models existed.
  yearRange: [number, number]
}

// Key: `${MAKE_UPPERCASE}|${model_name_from_vpic}`
export const MODEL_SUPPLEMENTS: Record<string, ModelSupplement[]> = {
  'GMC|Sierra': [
    {
      replaces: ['Sierra 1500'],
      yearRange: [1988, 9999],
    },
  ],
  'GMC|Sierra HD': [
    {
      replaces: ['Sierra 2500HD', 'Sierra 3500HD'],
      yearRange: [2001, 9999],
    },
  ],
  'CHEVROLET|Silverado': [
    {
      replaces: ['Silverado 1500'],
      yearRange: [1999, 9999],
    },
  ],
  'CHEVROLET|Silverado HD': [
    {
      replaces: ['Silverado 2500HD', 'Silverado 3500HD'],
      yearRange: [2001, 9999],
    },
  ],
}

// Returns the sub-model names to present for a given make/model/year combination,
// or null if no supplement applies.
export function getModelSupplement(
  make: string,
  model: string,
  year: number,
): string[] | null {
  const key = `${make.toUpperCase()}|${model}`
  const entries = MODEL_SUPPLEMENTS[key]
  if (!entries) return null

  const applicable: string[] = []
  for (const entry of entries) {
    if (year >= entry.yearRange[0] && year <= entry.yearRange[1]) {
      applicable.push(...entry.replaces)
    }
  }
  return applicable.length > 0 ? applicable : null
}
