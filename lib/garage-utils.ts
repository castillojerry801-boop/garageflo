import type { Vehicle, VehicleType } from '@/types'

export type GarageSection = 'vehicles' | 'equipment'

// 'other' and all non-road types map to Equipment & Tools.
export const VEHICLE_SECTION_MAP: Record<VehicleType, GarageSection> = {
  car:                 'vehicles',
  truck:               'vehicles',
  suv:                 'vehicles',
  motorcycle:          'vehicles',
  dirt_bike:           'vehicles',
  utv:                 'equipment',
  atv:                 'equipment',
  boat:                'equipment',
  personal_watercraft: 'equipment',
  snowmobile:          'equipment',
  riding_mower:        'equipment',
  push_mower:          'equipment',
  generator:           'equipment',
  trailer:             'equipment',
  camp_trailer:        'equipment',
  other:               'equipment',
}

export const GARAGE_SECTION_LABELS: Record<GarageSection, string> = {
  vehicles:  'Vehicles',
  equipment: 'Equipment & Tools',
}

// Sort vehicles for display: sort_order ASC NULLS LAST, then created_at ASC.
export function sortForDisplay(vehicles: Vehicle[]): Vehicle[] {
  return [...vehicles].sort((a, b) => {
    if (a.sort_order == null && b.sort_order == null) {
      return a.created_at < b.created_at ? -1 : 1
    }
    if (a.sort_order == null) return 1
    if (b.sort_order == null) return -1
    return a.sort_order - b.sort_order
  })
}

export interface GroupedVehicles {
  vehiclesSection:    Vehicle[]
  equipmentSection:   Vehicle[]
  showSectionHeaders: boolean
}

// Group into sections and sort each section independently.
export function groupVehicles(vehicles: Vehicle[]): GroupedVehicles {
  const vehiclesSection  = sortForDisplay(vehicles.filter(v => VEHICLE_SECTION_MAP[v.type] === 'vehicles'))
  const equipmentSection = sortForDisplay(vehicles.filter(v => VEHICLE_SECTION_MAP[v.type] === 'equipment'))
  const showSectionHeaders = vehiclesSection.length > 0 && equipmentSection.length > 0
  return { vehiclesSection, equipmentSection, showSectionHeaders }
}

// Move an item in an array — pure, no mutation.
export function moveItem<T>(arr: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) return arr
  const result = [...arr]
  const [item] = result.splice(fromIndex, 1)
  result.splice(toIndex, 0, item)
  return result
}

// Merge a reordered section back into a flat vehicle array,
// preserving the other section's items unchanged.
export function mergeSection(
  section: GarageSection,
  ordered: Vehicle[],
  base: Vehicle[],
): Vehicle[] {
  const other = base.filter(v => VEHICLE_SECTION_MAP[v.type] !== section)
  return [...ordered, ...other]
}
