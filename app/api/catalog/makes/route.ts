import { NextResponse } from 'next/server'
import { fetchMakes, VPIC_MAKE_TYPES } from '@/lib/catalog/vpic'
import type { VehicleType } from '@/types'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const vehicleType = searchParams.get('vehicleType')?.trim() as VehicleType | null

  if (!vehicleType || !(vehicleType in VPIC_MAKE_TYPES)) {
    return NextResponse.json({ makes: [] })
  }

  const makes = await fetchMakes(vehicleType)
  return NextResponse.json({ makes })
}
