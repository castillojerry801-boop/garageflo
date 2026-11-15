import { describe, it, expect } from 'vitest'
import { validateVin, resolveNhtsaVin, HIGHWAY_VIN_TYPES } from '@/lib/vin'

// A known-valid 17-character VIN (no I, O, Q; passes regex)
const VALID_VIN = '1HGBH41JXMN109186'

describe('HIGHWAY_VIN_TYPES', () => {
  it('includes all highway/road vehicle types', () => {
    for (const t of ['car', 'truck', 'suv', 'motorcycle', 'trailer', 'camp_trailer', 'dirt_bike']) {
      expect(HIGHWAY_VIN_TYPES.has(t)).toBe(true)
    }
  })

  it('excludes equipment and watercraft types', () => {
    for (const t of ['atv', 'utv', 'snowmobile', 'generator', 'boat', 'personal_watercraft',
      'riding_mower', 'push_mower', 'other']) {
      expect(HIGHWAY_VIN_TYPES.has(t)).toBe(false)
    }
  })
})

describe('validateVin — empty input', () => {
  it('returns empty for empty string', () => {
    expect(validateVin('', 'car').state).toBe('empty')
  })

  it('returns empty for whitespace-only string', () => {
    expect(validateVin('   ', 'car').state).toBe('empty')
  })
})

describe('validateVin — highway types (standard 17-char VIN)', () => {
  const highwayTypes = ['car', 'truck', 'suv', 'motorcycle', 'trailer', 'camp_trailer', 'dirt_bike']

  it.each(highwayTypes)('accepts correct 17-char VIN for %s', (type) => {
    expect(validateVin(VALID_VIN, type).state).toBe('valid')
  })

  it.each(highwayTypes)('returns nonstandard for 16-char input on %s', (type) => {
    expect(validateVin(VALID_VIN.slice(0, 16), type).state).toBe('nonstandard')
  })

  it.each(highwayTypes)('returns nonstandard for 18-char input on %s', (type) => {
    expect(validateVin(VALID_VIN + 'X', type).state).toBe('nonstandard')
  })

  it('returns nonstandard for short input (older/pre-1981 format)', () => {
    expect(validateVin('ABC1234', 'car').state).toBe('nonstandard')
  })

  it('flags I as invalid in a 17-char VIN', () => {
    // Replace position 0 with I
    const vin = 'I' + VALID_VIN.slice(1)
    const result = validateVin(vin, 'car')
    expect(result.state).toBe('invalid_chars')
    expect(result.invalidChars).toBe('I')
  })

  it('flags O as invalid in a 17-char VIN', () => {
    // Replace a valid char with O
    const vin = VALID_VIN.slice(0, 8) + 'O' + VALID_VIN.slice(9)
    const result = validateVin(vin, 'truck')
    expect(result.state).toBe('invalid_chars')
    expect(result.invalidChars).toBe('O')
  })

  it('flags Q as invalid in a 17-char VIN', () => {
    const vin = VALID_VIN.slice(0, 8) + 'Q' + VALID_VIN.slice(9)
    const result = validateVin(vin, 'suv')
    expect(result.state).toBe('invalid_chars')
    expect(result.invalidChars).toBe('Q')
  })

  it('reports all prohibited chars when multiple appear', () => {
    // Replace positions 0, 8, 10 with I, O, Q
    const chars = VALID_VIN.split('')
    chars[0] = 'I'
    chars[8] = 'O'
    chars[10] = 'Q'
    const vin = chars.join('')
    const result = validateVin(vin, 'motorcycle')
    expect(result.state).toBe('invalid_chars')
    expect(result.invalidChars).toContain('I')
    expect(result.invalidChars).toContain('O')
    expect(result.invalidChars).toContain('Q')
  })

  it('deduplicates repeated prohibited chars in the report', () => {
    // Two I's — should only appear once in invalidChars
    const vin = 'I' + VALID_VIN.slice(1, 8) + 'I' + VALID_VIN.slice(9)
    const result = validateVin(vin, 'car')
    expect(result.state).toBe('invalid_chars')
    expect(result.invalidChars).toBe('I')
  })

  it('normalizes lowercase input before validating', () => {
    expect(validateVin(VALID_VIN.toLowerCase(), 'car').state).toBe('valid')
  })

  it('trims surrounding whitespace before validating', () => {
    expect(validateVin(`  ${VALID_VIN}  `, 'car').state).toBe('valid')
  })

  it('returns invalid_chars (no message) for 17-char VIN with non-alphanumeric character', () => {
    // Hyphen in position 8 — 17 chars, no I/O/Q, but fails regex
    const vin = VALID_VIN.slice(0, 8) + '-' + VALID_VIN.slice(9)
    const result = validateVin(vin, 'car')
    expect(result.state).toBe('invalid_chars')
    expect(result.invalidChars).toBeUndefined()
  })
})

describe('validateVin — non-highway types (no 17-char constraint)', () => {
  const equipmentTypes = [
    'atv', 'utv', 'snowmobile', 'riding_mower', 'push_mower',
    'generator', 'boat', 'personal_watercraft', 'other',
  ]

  it.each(equipmentTypes)('accepts short serial number for %s', (type) => {
    expect(validateVin('SN12345', type).state).toBe('valid')
  })

  it.each(equipmentTypes)('accepts 17-char identifier for %s', (type) => {
    expect(validateVin(VALID_VIN, type).state).toBe('valid')
  })

  it.each(equipmentTypes)('accepts identifier containing I, O, or Q for %s', (type) => {
    // Equipment serial numbers may legitimately contain these characters
    expect(validateVin('IOQ123', type).state).toBe('valid')
  })

  it.each(equipmentTypes)('accepts long identifier for %s', (type) => {
    expect(validateVin('ABCDEF1234567890XYZ', type).state).toBe('valid')
  })
})

describe('resolveNhtsaVin — NHTSA-specific URL gating', () => {
  it('returns null for null vin', () => {
    expect(resolveNhtsaVin(null, 'car')).toBeNull()
  })

  it('returns null for undefined vin', () => {
    expect(resolveNhtsaVin(undefined, 'car')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(resolveNhtsaVin('', 'car')).toBeNull()
  })

  it('returns null for whitespace-only string', () => {
    expect(resolveNhtsaVin('   ', 'car')).toBeNull()
  })

  it('returns normalized VIN for a valid 17-char highway VIN', () => {
    expect(resolveNhtsaVin(VALID_VIN, 'car')).toBe(VALID_VIN)
  })

  it('returns uppercase normalized VIN when input is lowercase', () => {
    expect(resolveNhtsaVin(VALID_VIN.toLowerCase(), 'truck')).toBe(VALID_VIN)
  })

  it('returns null for a highway VIN with nonstandard length (older vehicle format)', () => {
    expect(resolveNhtsaVin('ABC1234', 'car')).toBeNull()
  })

  it('returns null for a highway VIN with 16 characters', () => {
    expect(resolveNhtsaVin(VALID_VIN.slice(0, 16), 'car')).toBeNull()
  })

  it('returns null for a highway VIN containing I', () => {
    expect(resolveNhtsaVin('I' + VALID_VIN.slice(1), 'car')).toBeNull()
  })

  it('returns null for a highway VIN containing O', () => {
    const vin = VALID_VIN.slice(0, 8) + 'O' + VALID_VIN.slice(9)
    expect(resolveNhtsaVin(vin, 'suv')).toBeNull()
  })

  it('returns null for a highway VIN containing Q', () => {
    const vin = VALID_VIN.slice(0, 8) + 'Q' + VALID_VIN.slice(9)
    expect(resolveNhtsaVin(vin, 'motorcycle')).toBeNull()
  })

  // Equipment serial numbers must never be used as NHTSA VIN lookups
  it('returns null for a valid-looking 17-char identifier on an ATV', () => {
    expect(resolveNhtsaVin(VALID_VIN, 'atv')).toBeNull()
  })

  it('returns null for an equipment serial number on a boat', () => {
    expect(resolveNhtsaVin('SN12345', 'boat')).toBeNull()
  })

  it('returns null for a serial containing I/O/Q on a generator', () => {
    expect(resolveNhtsaVin('IOQ1234', 'generator')).toBeNull()
  })

  it.each(['atv', 'utv', 'snowmobile', 'generator', 'boat', 'personal_watercraft',
    'riding_mower', 'push_mower', 'other'])(
    'returns null for any identifier on equipment type %s',
    (type) => {
      expect(resolveNhtsaVin(VALID_VIN, type)).toBeNull()
    },
  )

  it.each(['car', 'truck', 'suv', 'motorcycle', 'trailer', 'camp_trailer', 'dirt_bike'])(
    'returns VIN for valid highway type %s',
    (type) => {
      expect(resolveNhtsaVin(VALID_VIN, type)).toBe(VALID_VIN)
    },
  )
})
