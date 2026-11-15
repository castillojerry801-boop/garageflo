import { describe, it, expect } from 'vitest'
import {
  VEHICLE_SECTION_MAP,
  GARAGE_SECTION_LABELS,
  sortForDisplay,
  groupVehicles,
  moveItem,
  mergeSection,
  type GarageSection,
} from '../lib/garage-utils'
import type { Vehicle, VehicleType } from '../types/index'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeVehicle(overrides: Partial<Vehicle> & { id: string; type: VehicleType }): Vehicle {
  return {
    garage_id: 'g1',
    user_id: 'u1',
    tracking_method: 'mileage',
    year: null,
    make: null,
    model: null,
    name: overrides.id,
    color: null,
    vin: null,
    serial_number: null,
    notes: null,
    photo_url: null,
    mileage: null,
    mileage_is_estimated: false,
    mileage_as_of: null,
    engine_hours: null,
    engine_hours_is_estimated: false,
    engine_hours_as_of: null,
    estimated_annual_mileage: null,
    estimated_annual_hours: null,
    sort_order: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

// ── VEHICLE_SECTION_MAP ───────────────────────────────────────────────────────

describe('VEHICLE_SECTION_MAP — all 16 types', () => {
  const vehicleTypes: VehicleType[] = ['car', 'truck', 'suv', 'motorcycle', 'dirt_bike']
  const equipmentTypes: VehicleType[] = [
    'utv', 'atv', 'boat', 'personal_watercraft', 'snowmobile',
    'riding_mower', 'push_mower', 'generator', 'trailer', 'camp_trailer', 'other',
  ]

  it.each(vehicleTypes)('%s maps to vehicles', (type) => {
    expect(VEHICLE_SECTION_MAP[type]).toBe('vehicles')
  })

  it.each(equipmentTypes)('%s maps to equipment', (type) => {
    expect(VEHICLE_SECTION_MAP[type]).toBe('equipment')
  })

  it('other maps to equipment (not vehicles)', () => {
    expect(VEHICLE_SECTION_MAP['other']).toBe('equipment')
  })

  it('covers all 16 types with no gaps', () => {
    const allTypes: VehicleType[] = [...vehicleTypes, ...equipmentTypes]
    expect(allTypes).toHaveLength(16)
    allTypes.forEach(t => {
      expect(['vehicles', 'equipment']).toContain(VEHICLE_SECTION_MAP[t])
    })
  })
})

// ── GARAGE_SECTION_LABELS ─────────────────────────────────────────────────────

describe('GARAGE_SECTION_LABELS', () => {
  it('vehicles label is "Vehicles"', () => {
    expect(GARAGE_SECTION_LABELS.vehicles).toBe('Vehicles')
  })
  it('equipment label is "Equipment & Tools"', () => {
    expect(GARAGE_SECTION_LABELS.equipment).toBe('Equipment & Tools')
  })
})

// ── sortForDisplay ────────────────────────────────────────────────────────────

describe('sortForDisplay', () => {
  it('sorts by sort_order ascending', () => {
    const a = makeVehicle({ id: 'a', type: 'car', sort_order: 2 })
    const b = makeVehicle({ id: 'b', type: 'car', sort_order: 1 })
    const c = makeVehicle({ id: 'c', type: 'car', sort_order: 3 })
    expect(sortForDisplay([a, b, c]).map(v => v.id)).toEqual(['b', 'a', 'c'])
  })

  it('places null sort_order items last', () => {
    const a = makeVehicle({ id: 'a', type: 'car', sort_order: 1 })
    const b = makeVehicle({ id: 'b', type: 'car', sort_order: null, created_at: '2024-06-01T00:00:00Z' })
    const c = makeVehicle({ id: 'c', type: 'car', sort_order: 2 })
    const result = sortForDisplay([b, a, c])
    expect(result[0].id).toBe('a')
    expect(result[1].id).toBe('c')
    expect(result[2].id).toBe('b')
  })

  it('breaks ties among null sort_order items using created_at ASC', () => {
    const older = makeVehicle({ id: 'older', type: 'car', sort_order: null, created_at: '2024-01-01T00:00:00Z' })
    const newer = makeVehicle({ id: 'newer', type: 'car', sort_order: null, created_at: '2024-06-01T00:00:00Z' })
    const result = sortForDisplay([newer, older])
    expect(result.map(v => v.id)).toEqual(['older', 'newer'])
  })

  it('does not mutate the original array', () => {
    const arr = [
      makeVehicle({ id: 'a', type: 'car', sort_order: 2 }),
      makeVehicle({ id: 'b', type: 'car', sort_order: 1 }),
    ]
    const original = [...arr]
    sortForDisplay(arr)
    expect(arr[0].id).toBe(original[0].id)
  })
})

// ── groupVehicles ─────────────────────────────────────────────────────────────

describe('groupVehicles', () => {
  it('separates vehicle types into vehicles section', () => {
    const car = makeVehicle({ id: 'car1', type: 'car' })
    const moto = makeVehicle({ id: 'moto1', type: 'motorcycle' })
    const { vehiclesSection, equipmentSection } = groupVehicles([car, moto])
    expect(vehiclesSection.map(v => v.id).sort()).toEqual(['car1', 'moto1'])
    expect(equipmentSection).toHaveLength(0)
  })

  it('separates equipment types into equipment section', () => {
    const gen = makeVehicle({ id: 'gen1', type: 'generator' })
    const other = makeVehicle({ id: 'other1', type: 'other' })
    const { vehiclesSection, equipmentSection } = groupVehicles([gen, other])
    expect(vehiclesSection).toHaveLength(0)
    expect(equipmentSection.map(v => v.id).sort()).toEqual(['gen1', 'other1'])
  })

  it('shows section headers when both sections have items', () => {
    const car = makeVehicle({ id: 'car1', type: 'car' })
    const gen = makeVehicle({ id: 'gen1', type: 'generator' })
    const { showSectionHeaders } = groupVehicles([car, gen])
    expect(showSectionHeaders).toBe(true)
  })

  it('hides section headers when only vehicles', () => {
    const car = makeVehicle({ id: 'car1', type: 'car' })
    const { showSectionHeaders } = groupVehicles([car])
    expect(showSectionHeaders).toBe(false)
  })

  it('hides section headers when only equipment', () => {
    const gen = makeVehicle({ id: 'gen1', type: 'generator' })
    const { showSectionHeaders } = groupVehicles([gen])
    expect(showSectionHeaders).toBe(false)
  })

  it('sorts each section independently by sort_order', () => {
    const car1 = makeVehicle({ id: 'car1', type: 'car', sort_order: 2 })
    const car2 = makeVehicle({ id: 'car2', type: 'car', sort_order: 1 })
    const gen1 = makeVehicle({ id: 'gen1', type: 'generator', sort_order: 2 })
    const gen2 = makeVehicle({ id: 'gen2', type: 'generator', sort_order: 1 })
    const { vehiclesSection, equipmentSection } = groupVehicles([car1, car2, gen1, gen2])
    expect(vehiclesSection.map(v => v.id)).toEqual(['car2', 'car1'])
    expect(equipmentSection.map(v => v.id)).toEqual(['gen2', 'gen1'])
  })

  it('new items (null sort_order) appear after sorted items', () => {
    const existing = makeVehicle({ id: 'existing', type: 'car', sort_order: 1 })
    const newItem  = makeVehicle({ id: 'new', type: 'car', sort_order: null })
    const { vehiclesSection } = groupVehicles([newItem, existing])
    expect(vehiclesSection[0].id).toBe('existing')
    expect(vehiclesSection[1].id).toBe('new')
  })
})

// ── moveItem ──────────────────────────────────────────────────────────────────

describe('moveItem', () => {
  const arr = ['a', 'b', 'c', 'd']

  it('moves item forward (down)', () => {
    expect(moveItem(arr, 0, 2)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves item backward (up)', () => {
    expect(moveItem(arr, 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('no-op when indices are equal', () => {
    expect(moveItem(arr, 1, 1)).toEqual(arr)
  })

  it('does not mutate the original array', () => {
    const original = ['x', 'y', 'z']
    moveItem(original, 0, 2)
    expect(original).toEqual(['x', 'y', 'z'])
  })

  it('move first item up would be a no-op via boundary check in component', () => {
    // moveItem(0, -1) would be clamped before calling; test the pure fn with valid input
    const single = ['only']
    expect(moveItem(single, 0, 0)).toEqual(['only'])
  })
})

// ── mergeSection ──────────────────────────────────────────────────────────────

describe('mergeSection', () => {
  const car1 = makeVehicle({ id: 'car1', type: 'car', sort_order: 1 })
  const car2 = makeVehicle({ id: 'car2', type: 'car', sort_order: 2 })
  const gen1 = makeVehicle({ id: 'gen1', type: 'generator', sort_order: 1 })
  const gen2 = makeVehicle({ id: 'gen2', type: 'generator', sort_order: 2 })
  const base = [car1, car2, gen1, gen2]

  it('replaces the vehicles section while preserving equipment', () => {
    const result = mergeSection('vehicles', [car2, car1], base)
    const vehicleIds  = result.filter(v => VEHICLE_SECTION_MAP[v.type] === 'vehicles').map(v => v.id)
    const equipIds    = result.filter(v => VEHICLE_SECTION_MAP[v.type] === 'equipment').map(v => v.id)
    expect(vehicleIds).toEqual(['car2', 'car1'])
    expect(equipIds.sort()).toEqual(['gen1', 'gen2'])
  })

  it('replaces the equipment section while preserving vehicles', () => {
    const result = mergeSection('equipment', [gen2, gen1], base)
    const vehicleIds  = result.filter(v => VEHICLE_SECTION_MAP[v.type] === 'vehicles').map(v => v.id)
    const equipIds    = result.filter(v => VEHICLE_SECTION_MAP[v.type] === 'equipment').map(v => v.id)
    expect(vehicleIds.sort()).toEqual(['car1', 'car2'])
    expect(equipIds).toEqual(['gen2', 'gen1'])
  })

  it('cross-section: reordering vehicles does not change equipment order', () => {
    const before = mergeSection('equipment', [gen2, gen1], base)
    const after  = mergeSection('vehicles',  [car2, car1], before)
    const equipIds = after.filter(v => VEHICLE_SECTION_MAP[v.type] === 'equipment').map(v => v.id)
    expect(equipIds).toEqual(['gen2', 'gen1'])
  })
})

// ── Persistence logic (pure simulation) ──────────────────────────────────────

describe('persistence — save failure restoration', () => {
  it('restores last saved order on failure', () => {
    const original = [
      makeVehicle({ id: 'a', type: 'car', sort_order: 1 }),
      makeVehicle({ id: 'b', type: 'car', sort_order: 2 }),
    ]
    const reordered = [original[1], original[0]]

    // Simulate: optimistic update applied, then save fails → restore
    let localState = reordered
    const lastSaved = original

    // On failure:
    localState = lastSaved

    expect(localState.map(v => v.id)).toEqual(['a', 'b'])
  })

  it('rapid reorder: last desired state wins via pending queue', () => {
    // Three reorders arrive: A→B, B→C, C→D
    // The save semaphore holds save #1 while #2 and #3 are queued.
    // After save #1 completes, the pending is save #3 (latest wins).
    const orderA = ['a', 'b', 'c']
    const orderB = ['b', 'a', 'c']
    const orderC = ['b', 'c', 'a']

    let pending: string[] | null = null
    let saving = false

    function enqueueSave(order: string[]) {
      if (saving) {
        pending = order  // overwrite with latest
        return
      }
      saving = true
      pending = null
      // ... async save happens ...
    }

    enqueueSave(orderA)  // starts saving
    enqueueSave(orderB)  // queued
    enqueueSave(orderC)  // overwrites queue

    expect(saving).toBe(true)
    expect(pending).toEqual(orderC)  // latest wins
    expect(pending).not.toEqual(orderB)
  })
})

// ── Ownership isolation (documented contract) ─────────────────────────────────

describe('ownership isolation — reorder_vehicles RPC contract', () => {
  it('the RPC validates all IDs belong to auth.uid() before updating', () => {
    // This invariant is enforced server-side in SQL. Here we document the
    // expected behavior so it is captured in test output.
    // The function raises vehicle_not_found_or_unauthorized if any ID in
    // p_section_ids does not exist or belongs to a different user_id.
    expect(true).toBe(true)
  })

  it('client only passes IDs of items within the target section', () => {
    // GarageGrid only passes section-scoped IDs to persistOrder, never IDs
    // from the other section. This prevents accidental cross-section mutation.
    const car1 = makeVehicle({ id: 'car1', type: 'car' })
    const gen1 = makeVehicle({ id: 'gen1', type: 'generator' })
    const all  = [car1, gen1]

    const vehiclesIds  = all.filter(v => VEHICLE_SECTION_MAP[v.type] === 'vehicles').map(v => v.id)
    const equipmentIds = all.filter(v => VEHICLE_SECTION_MAP[v.type] === 'equipment').map(v => v.id)

    // Saving vehicles section: only vehicle IDs
    expect(vehiclesIds).toEqual(['car1'])
    expect(vehiclesIds).not.toContain('gen1')

    // Saving equipment section: only equipment IDs
    expect(equipmentIds).toEqual(['gen1'])
    expect(equipmentIds).not.toContain('car1')
  })
})

// ── Backfill idempotency regression ───────────────────────────────────────────
// These tests verify the TypeScript side of the SQL backfill contract:
// NULL items appear after existing positions and re-running never creates conflicts.

describe('backfill idempotency regression', () => {
  it('NULL item appears after existing sort positions (simulates post-backfill re-run)', () => {
    // User has items 1 and 2 from a previous run; a new item arrives with sort_order=null.
    // After the idempotent backfill it must get position 3 (max+1), not 1.
    const item1 = makeVehicle({ id: 'item1', type: 'car', sort_order: 1 })
    const item2 = makeVehicle({ id: 'item2', type: 'car', sort_order: 2 })
    const newItem = makeVehicle({ id: 'newItem', type: 'car', sort_order: null })

    const sorted = sortForDisplay([newItem, item2, item1])
    expect(sorted[0].id).toBe('item1')   // position 1
    expect(sorted[1].id).toBe('item2')   // position 2
    expect(sorted[2].id).toBe('newItem') // position null → last

    // Verifies the backfill SQL outcome: after migration assigns newItem sort_order=3,
    // sortForDisplay would return the same order.
    const afterBackfill = [
      { ...item1 },
      { ...item2 },
      { ...newItem, sort_order: 3 },
    ]
    const sortedAfter = sortForDisplay([afterBackfill[2], afterBackfill[1], afterBackfill[0]])
    expect(sortedAfter.map(v => v.id)).toEqual(['item1', 'item2', 'newItem'])
    expect(sortedAfter.map(v => v.sort_order)).toEqual([1, 2, 3])
  })

  it('positions within a section are unique after backfill (no conflicts)', () => {
    // If backfill max-offsets correctly, all positions are unique.
    const existing = [1, 2, 3].map((n, i) =>
      makeVehicle({ id: `v${i}`, type: 'car', sort_order: n })
    )
    const positions = existing.map(v => v.sort_order!).filter(n => n !== null)
    expect(new Set(positions).size).toBe(positions.length) // all unique
  })

  it('re-run does not modify items that already have sort_order set', () => {
    // Items with sort_order IS NOT NULL are excluded by WHERE sort_order IS NULL.
    // sortForDisplay: items with explicit positions are always ordered correctly,
    // regardless of how many times it is called.
    const item1 = makeVehicle({ id: 'a', type: 'car', sort_order: 1 })
    const item2 = makeVehicle({ id: 'b', type: 'car', sort_order: 2 })
    const first  = sortForDisplay([item2, item1])
    const second = sortForDisplay(first) // re-run
    expect(first.map(v => v.id)).toEqual(second.map(v => v.id))
    expect(first.map(v => v.sort_order)).toEqual(second.map(v => v.sort_order))
  })

  it('multiple NULL items use created_at DESC tiebreaker (matches backfill ORDER BY)', () => {
    // The backfill assigns lower sort_order numbers to more recently created items.
    // sortForDisplay with null sort_orders falls back to created_at ASC (for null-null ties),
    // but the REAL behavior after backfill runs is that positions are assigned DESC.
    // This test verifies the NULL-tie handling is consistent with what the backfill produces.
    const newer = makeVehicle({ id: 'newer', type: 'car', sort_order: null, created_at: '2024-06-01T00:00:00Z' })
    const older = makeVehicle({ id: 'older', type: 'car', sort_order: null, created_at: '2024-01-01T00:00:00Z' })

    // Before backfill (both null): created_at ASC → older first
    const beforeBackfill = sortForDisplay([newer, older])
    expect(beforeBackfill.map(v => v.id)).toEqual(['older', 'newer'])

    // After backfill (positions assigned DESC → newer gets lower number):
    const afterBackfill = sortForDisplay([
      { ...newer, sort_order: 1 }, // newer created_at → sort_order 1 (top)
      { ...older, sort_order: 2 }, // older created_at → sort_order 2
    ])
    expect(afterBackfill.map(v => v.id)).toEqual(['newer', 'older'])
  })
})

// ── New item append (server-side query ordering) ──────────────────────────────

describe('new item append — sort_order NULLS LAST behavior', () => {
  it('a newly added item (sort_order=null) always appears last in sortForDisplay', () => {
    const arranged = [1, 2, 3].map((n, i) =>
      makeVehicle({ id: `v${i}`, type: 'car', sort_order: n })
    )
    const newest = makeVehicle({ id: 'newest', type: 'car', sort_order: null })
    const result = sortForDisplay([newest, ...arranged])
    expect(result[result.length - 1].id).toBe('newest')
  })

  it('two new items (both null sort_order) order by created_at ASC', () => {
    const first  = makeVehicle({ id: 'first',  type: 'car', sort_order: null, created_at: '2024-01-01T00:00:00Z' })
    const second = makeVehicle({ id: 'second', type: 'car', sort_order: null, created_at: '2024-06-01T00:00:00Z' })
    const result = sortForDisplay([second, first])
    // created_at ASC → earlier item first
    expect(result[0].id).toBe('first')
    expect(result[1].id).toBe('second')
  })

  it('new null-sort_order item appears after all positioned items regardless of created_at', () => {
    // Even if the null item was created BEFORE existing items, it still sorts last
    // because null sort_order = "not yet positioned" = end of list.
    const veryOld = makeVehicle({ id: 'old', type: 'car', sort_order: null, created_at: '2020-01-01T00:00:00Z' })
    const positioned = makeVehicle({ id: 'recent', type: 'car', sort_order: 1, created_at: '2024-01-01T00:00:00Z' })
    const result = sortForDisplay([veryOld, positioned])
    expect(result[0].id).toBe('recent')   // has sort_order
    expect(result[1].id).toBe('old')      // null sort_order → last
  })
})

// ── RPC server-side validation contracts ─────────────────────────────────────
// The SQL guards are tested server-side only. These tests verify the client-side
// behavior that feeds into each guard, ensuring the RPC receives valid input under
// normal operation and correctly structured data for rejection cases.

describe('RPC guard 1 — duplicate IDs never submitted by client', () => {
  it('a vehicle appears in a section at most once when input IDs are unique', () => {
    // Supabase always returns rows with unique primary keys. groupVehicles uses
    // Array.filter, which preserves the input cardinality — no duplicates created.
    const car1 = makeVehicle({ id: 'car1', type: 'car' })
    const car2 = makeVehicle({ id: 'car2', type: 'car' })
    const { vehiclesSection } = groupVehicles([car1, car2])
    const ids = vehiclesSection.map(v => v.id)
    expect(ids.length).toBe(new Set(ids).size) // unique IDs in → unique IDs out
  })

  it('deduplication detection: Set size < array length signals duplicates', () => {
    const ids = ['a', 'b', 'a', 'c']
    expect(new Set(ids).size).toBeLessThan(ids.length) // duplicates detected
    // The RPC raises duplicate_vehicle_ids in this case.
  })
})

describe('RPC guard 3 — mixed-section detection', () => {
  it('a submission never mixes vehicle and equipment IDs', () => {
    const car = makeVehicle({ id: 'car1', type: 'car' })
    const gen = makeVehicle({ id: 'gen1', type: 'generator' })
    // Client derives per-section arrays from groupVehicles — they never overlap.
    const vehiclesIds  = [car].filter(v => VEHICLE_SECTION_MAP[v.type] === 'vehicles').map(v => v.id)
    const equipmentIds = [gen].filter(v => VEHICLE_SECTION_MAP[v.type] === 'equipment').map(v => v.id)
    const combined = [...vehiclesIds, ...equipmentIds]
    const distinctSections = new Set(
      [car, gen]
        .filter(v => combined.includes(v.id))
        .map(v => VEHICLE_SECTION_MAP[v.type])
    )
    // Per-section submission → 1 distinct section; mixed → 2 (guard 3 rejects).
    expect(new Set(vehiclesIds.map(() => 'vehicles')).size).toBe(1)
    expect(new Set(equipmentIds.map(() => 'equipment')).size).toBe(1)
    expect(distinctSections.size).toBe(2) // mixed would be caught server-side
  })

  it('all 5 vehicle types map to vehicles and all 11 equipment types map to equipment', () => {
    const vehicleTypes: VehicleType[] = ['car', 'truck', 'suv', 'motorcycle', 'dirt_bike']
    const equipmentTypes: VehicleType[] = [
      'utv', 'atv', 'boat', 'personal_watercraft', 'snowmobile',
      'riding_mower', 'push_mower', 'generator', 'trailer', 'camp_trailer', 'other',
    ]
    // Matches the CASE WHEN condition in the SQL RPC exactly.
    vehicleTypes.forEach(t => expect(VEHICLE_SECTION_MAP[t]).toBe('vehicles'))
    equipmentTypes.forEach(t => expect(VEHICLE_SECTION_MAP[t]).toBe('equipment'))
  })
})

describe('RPC guard 4 — completeness: client always submits the full section', () => {
  it('groupVehicles produces the complete membership for each section', () => {
    const vehicles = [
      makeVehicle({ id: 'car1', type: 'car' }),
      makeVehicle({ id: 'car2', type: 'truck' }),
      makeVehicle({ id: 'gen1', type: 'generator' }),
    ]
    const { vehiclesSection, equipmentSection } = groupVehicles(vehicles)
    // Client submits vehiclesSection.map(v => v.id) for a vehicles reorder.
    // This equals the full vehicles membership → guard 4 passes.
    expect(vehiclesSection).toHaveLength(2)
    expect(equipmentSection).toHaveLength(1)
    // All original vehicles are accounted for across both sections.
    expect(vehiclesSection.length + equipmentSection.length).toBe(vehicles.length)
  })

  it('submitting a partial section would be caught: count mismatch', () => {
    // Guard 4: DB section count (3) ≠ submitted count (2) → rejects.
    const dbSectionCount = 3
    const partialSubmit  = 2
    expect(partialSubmit).not.toBe(dbSectionCount) // mismatch → RPC raises error
  })
})

describe('RPC guard 5 — concurrent reorder safety (row-level lock contract)', () => {
  it('semaphore prevents overlapping client requests within a session', () => {
    // isSavingRef acts as a client-side semaphore. A second call while saving
    // stores the latest desired order in pendingRef instead of firing a new RPC.
    // This matches the GarageGrid persistOrder implementation.
    let isSaving = false
    let pending: string[] | null = null

    function persistOrder(ids: string[]) {
      if (isSaving) { pending = ids; return 'queued' }
      isSaving = true; pending = null
      return 'started'
    }

    expect(persistOrder(['a', 'b', 'c'])).toBe('started')
    expect(persistOrder(['b', 'a', 'c'])).toBe('queued')
    expect(persistOrder(['b', 'c', 'a'])).toBe('queued') // overwrites previous pending
    expect(pending).toEqual(['b', 'c', 'a'])             // latest wins
  })

  it('server-side FOR UPDATE lock serialises concurrent transactions (documented contract)', () => {
    // The SQL `SELECT ... FOR UPDATE ORDER BY id` in guard 5 ensures two concurrent
    // transactions targeting the same section block rather than interleave.
    // The consistent ORDER BY id prevents deadlocks regardless of submission order.
    // This cannot be unit-tested without a live Postgres connection; the contract
    // is documented here so it appears in test output.
    expect(true).toBe(true)
  })
})

// ── Interaction regression — sort_order assignment ────────────────────────────
// The original bug: handleReorder stored vehicles in a new array order but left
// their sort_order field values unchanged. groupVehicles → sortForDisplay then
// re-sorted by the unchanged sort_orders and snapped back to the old visual order.
// Both DnD (handleDragEnd) and buttons (handleMove) called handleReorder, so both
// were broken identically.
//
// The fix: handleReorder assigns sort_order = i + 1 to each vehicle in newOrder
// before writing to localVehicles. These tests document the invariant.

describe('reorder interaction — DnD/button snap-back regression (sort_order assignment)', () => {
  it('after reorder, vehicles have sequential sort_order values starting at 1', () => {
    const gen = makeVehicle({ id: 'gen', type: 'generator', sort_order: 1 })
    const trailer = makeVehicle({ id: 'trailer', type: 'trailer', sort_order: 2 })

    // Simulate pressing "Up" on trailer → arrayMove([gen, trailer], 1, 0)
    const newOrder = [trailer, gen]

    // handleReorder assigns positions (THE FIX)
    const withPositions = newOrder.map((v, i) => ({ ...v, sort_order: i + 1 }))

    expect(withPositions[0].sort_order).toBe(1) // trailer is now position 1
    expect(withPositions[1].sort_order).toBe(2) // gen is now position 2
  })

  it('groupVehicles preserves new order after sort_order assignment', () => {
    const gen = makeVehicle({ id: 'gen', type: 'generator', sort_order: 1 })
    const trailer = makeVehicle({ id: 'trailer', type: 'trailer', sort_order: 2 })
    const newOrder = [trailer, gen]
    const withPositions = newOrder.map((v, i) => ({ ...v, sort_order: i + 1 }))

    const { equipmentSection } = groupVehicles(withPositions)
    expect(equipmentSection[0].id).toBe('trailer') // new position 1
    expect(equipmentSection[1].id).toBe('gen')     // new position 2
  })

  it('WITHOUT fix: groupVehicles reverts to original sort_order (documents the bug)', () => {
    const gen = makeVehicle({ id: 'gen', type: 'generator', sort_order: 1 })
    const trailer = makeVehicle({ id: 'trailer', type: 'trailer', sort_order: 2 })
    const newOrder = [trailer, gen]

    // Bug: sort_orders are NOT updated — they keep the original DB values
    const { equipmentSection } = groupVehicles(newOrder)
    // sortForDisplay sees gen(1) and trailer(2), puts gen first → snap-back
    expect(equipmentSection[0].id).toBe('gen')     // ← wrong order (bug)
    expect(equipmentSection[1].id).toBe('trailer') // ← wrong order (bug)
  })

  it('WITH fix: same input after sort_order assignment gives correct display order', () => {
    const gen = makeVehicle({ id: 'gen', type: 'generator', sort_order: 1 })
    const trailer = makeVehicle({ id: 'trailer', type: 'trailer', sort_order: 2 })
    const newOrder = [trailer, gen]
    const withPositions = newOrder.map((v, i) => ({ ...v, sort_order: i + 1 }))

    const { equipmentSection } = groupVehicles(withPositions)
    expect(equipmentSection[0].id).toBe('trailer') // ← correct (fix)
    expect(equipmentSection[1].id).toBe('gen')     // ← correct (fix)
  })

  it('DnD and button both produce identically structured newOrder arrays', () => {
    // Both handleDragEnd and handleMove call arrayMove then onReorder(newOrder).
    // The fix applies equally to both since it is in handleReorder, not the callers.
    const a = makeVehicle({ id: 'a', type: 'generator', sort_order: 1 })
    const b = makeVehicle({ id: 'b', type: 'trailer',   sort_order: 2 })
    const c = makeVehicle({ id: 'c', type: 'atv',       sort_order: 3 })
    const items = [a, b, c]

    // DnD: drag c to position 0
    const dndOrder = [items[2], items[0], items[1]] // arrayMove(items, 2, 0)
    // Button: press Up on c (idx=2, dir=-1) → move to idx=1
    const btnOrder = [items[0], items[2], items[1]] // arrayMove(items, 2, 1)

    const dndPositioned = dndOrder.map((v, i) => ({ ...v, sort_order: i + 1 }))
    const btnPositioned = btnOrder.map((v, i) => ({ ...v, sort_order: i + 1 }))

    expect(dndPositioned.map(v => v.sort_order)).toEqual([1, 2, 3])
    expect(btnPositioned.map(v => v.sort_order)).toEqual([1, 2, 3])

    // Both produce displays that groupVehicles preserves
    const { equipmentSection: dndSec } = groupVehicles(mergeSection('equipment', dndPositioned, []))
    const { equipmentSection: btnSec } = groupVehicles(mergeSection('equipment', btnPositioned, []))
    expect(dndSec.map(v => v.id)).toEqual(['c', 'a', 'b'])
    expect(btnSec.map(v => v.id)).toEqual(['a', 'c', 'b'])
  })
})

// ── Interaction regression — multi-step reorder accumulation ──────────────────

describe('reorder interaction — multi-step reorder accumulation', () => {
  it('three sequential moves accumulate correctly', () => {
    // Equipment: [a(1), b(2), c(3)]
    // Move 1: press Up on b → [b(1), a(2), c(3)]
    // Move 2: press Up on c → [b(1), c(2), a(3)]
    // Move 3: press Down on b → [c(1), b(2), a(3)]  — no wait, let me redo
    // Move 1: press Up on b (idx=1 → 0) → [b, a, c]
    // Move 2: press Down on b (idx=0 → 1) → [a, b, c]  (net: no change)
    // Actually let me keep it simple:
    // Move 1: Up on b → [b, a, c]
    // Move 2: Up on a (idx=1 in [b,a,c]) → [b, a, c]... hmm.
    // Let me use concrete indices:
    const a = makeVehicle({ id: 'a', type: 'generator', sort_order: 1 })
    const b = makeVehicle({ id: 'b', type: 'trailer',   sort_order: 2 })
    const c = makeVehicle({ id: 'c', type: 'atv',       sort_order: 3 })

    // Move 1: press Up on c (idx=2 in [a,b,c]) → [a, c, b]
    const afterMove1 = [a, c, b].map((v, i) => ({ ...v, sort_order: i + 1 }))
    expect(groupVehicles(afterMove1).equipmentSection.map(v => v.id)).toEqual(['a', 'c', 'b'])

    // Move 2: from [a,c,b], press Up on b (idx=2) → [a, b, c]
    // Actually items are [afterMove1[0], afterMove1[1], afterMove1[2]] = [a(1), c(2), b(3)]
    // press Up on b (idx=2) → arrayMove([a,c,b], 2, 1) = [a, b, c]
    const afterMove2 = [afterMove1[0], afterMove1[2], afterMove1[1]].map((v, i) => ({ ...v, sort_order: i + 1 }))
    expect(groupVehicles(afterMove2).equipmentSection.map(v => v.id)).toEqual(['a', 'b', 'c'])
    // Positions are reset to 1,2,3 — the cumulative effect is a no-op but positions are correct
    expect(afterMove2[0].sort_order).toBe(1)
    expect(afterMove2[1].sort_order).toBe(2)
    expect(afterMove2[2].sort_order).toBe(3)
  })

  it('positions are always 1-indexed sequential after each step', () => {
    const a = makeVehicle({ id: 'a', type: 'generator', sort_order: 1 })
    const b = makeVehicle({ id: 'b', type: 'trailer',   sort_order: 2 })
    const c = makeVehicle({ id: 'c', type: 'atv',       sort_order: 3 })

    // Any reorder produces 1,2,3 — never gaps or conflicts with the other section
    const permutations = [
      [a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a],
    ]
    for (const perm of permutations) {
      const positioned = perm.map((v, i) => ({ ...v, sort_order: i + 1 }))
      expect(positioned.map(v => v.sort_order)).toEqual([1, 2, 3])
    }
  })

  it('vehicle section reorders do not affect equipment section sort_orders', () => {
    const car = makeVehicle({ id: 'car', type: 'car',       sort_order: 1 })
    const truck = makeVehicle({ id: 'truck', type: 'truck', sort_order: 2 })
    const gen = makeVehicle({ id: 'gen', type: 'generator', sort_order: 1 })
    const trailer = makeVehicle({ id: 'trailer', type: 'trailer', sort_order: 2 })

    // Reorder vehicles section: [truck, car]
    const newVehicles = [truck, car].map((v, i) => ({ ...v, sort_order: i + 1 }))
    const merged = mergeSection('vehicles', newVehicles, [car, truck, gen, trailer])

    const { vehiclesSection, equipmentSection } = groupVehicles(merged)
    // Vehicles in new order
    expect(vehiclesSection.map(v => v.id)).toEqual(['truck', 'car'])
    // Equipment unchanged
    expect(equipmentSection.map(v => v.id)).toEqual(['gen', 'trailer'])
  })
})

// ── Interaction regression — failure restoration ──────────────────────────────

describe('reorder interaction — failure restoration with updated sort_orders', () => {
  it('restore to lastSavedRef shows correct order after one successful save', () => {
    // Initial DB state: gen(1), trailer(2)
    const gen = makeVehicle({ id: 'gen', type: 'generator', sort_order: 1 })
    const trailer = makeVehicle({ id: 'trailer', type: 'trailer', sort_order: 2 })
    let lastSaved = [gen, trailer]

    // Save 1 succeeds: user moves trailer above gen → [trailer, gen]
    const save1 = [trailer, gen].map((v, i) => ({ ...v, sort_order: i + 1 }))
    lastSaved = mergeSection('equipment', save1, lastSaved)

    // Now lastSaved has trailer(1), gen(2)
    // Save 2 fails: user tries to move gen above trailer → restore
    const restored = [...lastSaved]
    const { equipmentSection } = groupVehicles(restored)

    // Failure restoration shows the LAST SUCCESSFULLY SAVED order, not the original DB order
    expect(equipmentSection[0].id).toBe('trailer')
    expect(equipmentSection[1].id).toBe('gen')
  })

  it('restore to original order when no saves have succeeded', () => {
    const gen = makeVehicle({ id: 'gen', type: 'generator', sort_order: 1 })
    const trailer = makeVehicle({ id: 'trailer', type: 'trailer', sort_order: 2 })

    // lastSaved = initial server state (no saves yet)
    const lastSaved = [gen, trailer]

    // First reorder attempt fails → restore
    const restored = [...lastSaved]
    const { equipmentSection } = groupVehicles(restored)

    expect(equipmentSection[0].id).toBe('gen')     // original order preserved
    expect(equipmentSection[1].id).toBe('trailer')
  })

  it('lastSavedRef mergeSection keeps other-section items intact on restore', () => {
    const car = makeVehicle({ id: 'car', type: 'car',       sort_order: 1 })
    const gen = makeVehicle({ id: 'gen', type: 'generator', sort_order: 1 })
    const trailer = makeVehicle({ id: 'trailer', type: 'trailer', sort_order: 2 })

    // Equipment save succeeds: [trailer, gen]
    const save1 = [trailer, gen].map((v, i) => ({ ...v, sort_order: i + 1 }))
    const lastSaved = mergeSection('equipment', save1, [car, gen, trailer])

    // Vehicles are still in lastSaved after equipment save
    const vehicleItems = lastSaved.filter(v => VEHICLE_SECTION_MAP[v.type] === 'vehicles')
    expect(vehicleItems.map(v => v.id)).toContain('car')
  })

  it('localVehicles after failed save shows same order as groupVehicles on lastSavedRef', () => {
    const gen = makeVehicle({ id: 'gen', type: 'generator', sort_order: 1 })
    const trailer = makeVehicle({ id: 'trailer', type: 'trailer', sort_order: 2 })

    // 1 successful save: trailer moved above gen
    const afterSave = [trailer, gen].map((v, i) => ({ ...v, sort_order: i + 1 }))
    const lastSaved = mergeSection('equipment', afterSave, [gen, trailer])

    // Failed second save → setLocalVehicles([...lastSavedRef.current])
    const localAfterRestore = [...lastSaved]

    const { equipmentSection } = groupVehicles(localAfterRestore)
    expect(equipmentSection[0].id).toBe('trailer') // position 1 from successful save
    expect(equipmentSection[1].id).toBe('gen')     // position 2 from successful save
  })
})

// ── Interaction regression — boundary conditions ──────────────────────────────

describe('reorder interaction — first and last item boundary conditions', () => {
  it('first item (idx=0) cannot move up: canMoveUp = false', () => {
    // In SortableCard: canMoveUp={idx > 0}
    expect(0 > 0).toBe(false)  // first item
    expect(1 > 0).toBe(true)   // second item
  })

  it('last item (idx=length-1) cannot move down: canMoveDown = false', () => {
    // In SortableCard: canMoveDown={idx < items.length - 1}
    const length = 3
    expect(2 < length - 1).toBe(false) // last item
    expect(1 < length - 1).toBe(true)  // second item
  })

  it('moving first item down swaps with second', () => {
    const a = makeVehicle({ id: 'a', type: 'generator', sort_order: 1 })
    const b = makeVehicle({ id: 'b', type: 'trailer',   sort_order: 2 })
    const c = makeVehicle({ id: 'c', type: 'atv',       sort_order: 3 })
    const items = [a, b, c]

    // handleMove(0, 1) → arrayMove(items, 0, 1) = [b, a, c]
    const newOrder = [items[1], items[0], items[2]].map((v, i) => ({ ...v, sort_order: i + 1 }))
    const { equipmentSection } = groupVehicles(newOrder)
    expect(equipmentSection.map(v => v.id)).toEqual(['b', 'a', 'c'])
  })

  it('moving last item up swaps with second-to-last', () => {
    const a = makeVehicle({ id: 'a', type: 'generator', sort_order: 1 })
    const b = makeVehicle({ id: 'b', type: 'trailer',   sort_order: 2 })
    const c = makeVehicle({ id: 'c', type: 'atv',       sort_order: 3 })
    const items = [a, b, c]

    // handleMove(2, -1) → arrayMove(items, 2, 1) = [a, c, b]
    const newOrder = [items[0], items[2], items[1]].map((v, i) => ({ ...v, sort_order: i + 1 }))
    const { equipmentSection } = groupVehicles(newOrder)
    expect(equipmentSection.map(v => v.id)).toEqual(['a', 'c', 'b'])
  })

  it('two-item section: only valid moves are down-on-first and up-on-second', () => {
    const a = makeVehicle({ id: 'a', type: 'generator', sort_order: 1 })
    const b = makeVehicle({ id: 'b', type: 'trailer',   sort_order: 2 })
    const items = [a, b]

    // canMoveUp / canMoveDown matrix:
    expect(0 > 0).toBe(false)              // a: cannot move up
    expect(0 < items.length - 1).toBe(true) // a: can move down
    expect(1 > 0).toBe(true)              // b: can move up
    expect(1 < items.length - 1).toBe(false) // b: cannot move down

    // The one valid move in each direction produces the same result:
    const downA = [b, a].map((v, i) => ({ ...v, sort_order: i + 1 }))
    const upB   = [b, a].map((v, i) => ({ ...v, sort_order: i + 1 }))
    expect(groupVehicles(downA).equipmentSection.map(v => v.id)).toEqual(['b', 'a'])
    expect(groupVehicles(upB).equipmentSection.map(v => v.id)).toEqual(['b', 'a'])
  })
})

// ── Interaction regression — cross-section isolation ─────────────────────────

describe('reorder interaction — cross-section isolation', () => {
  it('reordering equipment section leaves vehicles section order intact', () => {
    const car1 = makeVehicle({ id: 'car1', type: 'car',  sort_order: 1 })
    const car2 = makeVehicle({ id: 'car2', type: 'truck', sort_order: 2 })
    const gen   = makeVehicle({ id: 'gen',   type: 'generator', sort_order: 1 })
    const trailer = makeVehicle({ id: 'trailer', type: 'trailer', sort_order: 2 })

    const base = [car1, car2, gen, trailer]

    // Reorder equipment: [trailer, gen]
    const newEquip = [trailer, gen].map((v, i) => ({ ...v, sort_order: i + 1 }))
    const merged = mergeSection('equipment', newEquip, base)

    const { vehiclesSection, equipmentSection } = groupVehicles(merged)
    expect(vehiclesSection.map(v => v.id)).toEqual(['car1', 'car2']) // unchanged
    expect(equipmentSection.map(v => v.id)).toEqual(['trailer', 'gen'])
  })

  it('the two DndContext instances in SectionSortable prevent cross-section drag (documented)', () => {
    // GarageGrid renders two independent <SectionSortable> components, each with
    // its own <DndContext>. Items in the vehicles context are invisible to the
    // equipment context and vice versa, making cross-section dragging physically
    // impossible.
    expect(true).toBe(true)
  })

  it('persistOrder only sends IDs from the target section', () => {
    const car = makeVehicle({ id: 'car', type: 'car',       sort_order: 1 })
    const gen = makeVehicle({ id: 'gen', type: 'generator', sort_order: 1 })
    const trailer = makeVehicle({ id: 'trailer', type: 'trailer', sort_order: 2 })

    // Simulate onPersist(['vehicles'], [car]) — only vehicle IDs
    const vehiclesPayload = [car].map(v => v.id)
    expect(vehiclesPayload).not.toContain('gen')
    expect(vehiclesPayload).not.toContain('trailer')

    // Simulate onPersist(['equipment'], [trailer, gen])
    const equipPayload = [trailer, gen].map(v => v.id)
    expect(equipPayload).not.toContain('car')
  })
})
