// Standard 17-character VIN: ISO 3779 / FMVSS 115 (applies to vehicles
// manufactured from 1981 onward). Characters I, O, Q are excluded from VINs
// because they are visually ambiguous with 1, 0, and 0 in many fonts.
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/

export type VinState =
  | 'empty'
  | 'valid'
  | 'nonstandard'      // not 17 chars — may be an older vehicle or equipment serial
  | 'invalid_chars'    // 17 chars but contains I, O, or Q

export interface VinValidation {
  state: VinState
  invalidChars?: string  // e.g. "I, O" — present only on invalid_chars
}

// Vehicle types subject to FMVSS 115 / ISO 3779 (applies to vehicles
// manufactured from 1981 onward). Equipment and watercraft use different formats.
export const HIGHWAY_VIN_TYPES: Set<string> = new Set([
  'car', 'truck', 'suv', 'motorcycle', 'trailer', 'camp_trailer', 'dirt_bike',
])

export function validateVin(value: string, vehicleType: string): VinValidation {
  const v = value.trim().toUpperCase()
  if (!v) return { state: 'empty' }

  // Off-road equipment, watercraft, and other types use serial/hull numbers of
  // varying length — the 17-char VIN standard does not apply to them.
  if (!HIGHWAY_VIN_TYPES.has(vehicleType)) return { state: 'valid' }

  if (v.length !== 17) return { state: 'nonstandard' }

  const bad = [...new Set([...v].filter(c => 'IOQ'.includes(c)))]
  if (bad.length > 0) return { state: 'invalid_chars', invalidChars: bad.join(', ') }

  if (!VIN_RE.test(v)) return { state: 'invalid_chars' }

  return { state: 'valid' }
}

// Returns the normalized VIN to embed in the NHTSA vehicle-specific recall URL,
// or null if the identifier should not be used as a highway VIN lookup.
// Null is returned for: missing values, non-highway vehicle types (equipment
// serials/hull IDs stored in the same field), nonstandard lengths, and VINs
// containing the excluded characters I, O, or Q.
export function resolveNhtsaVin(vin: string | null | undefined, vehicleType: string): string | null {
  if (!vin) return null
  if (!HIGHWAY_VIN_TYPES.has(vehicleType)) return null
  const normalized = vin.trim().toUpperCase()
  if (validateVin(normalized, vehicleType).state !== 'valid') return null
  return normalized
}
