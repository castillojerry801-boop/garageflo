import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { RECALL_PROVIDER_PLAN, CPSC_TYPE_KEYWORDS } from '@/lib/recalls/types'
import { fetchNhtsaRecalls } from '@/lib/recalls/nhtsa'
import { fetchCpscRecalls } from '@/lib/recalls/cpsc'
import type { VehicleType } from '@/types'
import type { RecallsApiResponse, ProviderResult } from '@/lib/recalls/types'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const vehicleId = searchParams.get('vehicleId')?.trim()
  if (!vehicleId) {
    return NextResponse.json({ error: 'vehicleId is required' }, { status: 400 })
  }

  // Ownership check — only return data for this user's vehicle.
  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id, type, year, make, model, vin')
    .eq('id', vehicleId)
    .eq('user_id', user.id)
    .single()

  if (!vehicle) {
    return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })
  }

  const type = vehicle.type as VehicleType
  const plan = RECALL_PROVIDER_PLAN[type] ?? { providers: ['cpsc'], showUscgLink: false }
  const typeKeywords = CPSC_TYPE_KEYWORDS[type] ?? []

  const providerResults: ProviderResult[] = await Promise.all(
    plan.providers.map(async (provider): Promise<ProviderResult> => {
      if (provider === 'nhtsa') {
        const missing: string[] = []
        if (!vehicle.year)  missing.push('year')
        if (!vehicle.make)  missing.push('make')
        if (!vehicle.model) missing.push('model')
        if (missing.length > 0) {
          return { provider: 'nhtsa', status: 'incomplete_data', recalls: [], missingFields: missing }
        }
        return fetchNhtsaRecalls(vehicle.make!, vehicle.model!, vehicle.year!)
      }

      if (provider === 'cpsc') {
        if (!vehicle.make) {
          return { provider: 'cpsc', status: 'incomplete_data', recalls: [], missingFields: ['make'] }
        }
        return fetchCpscRecalls(vehicle.make, typeKeywords)
      }

      return { provider, status: 'provider_error', recalls: [] }
    }),
  )

  const response: RecallsApiResponse = {
    vehicleId,
    fetchedAt: new Date().toISOString(),
    providers: providerResults,
    showUscgLink: plan.showUscgLink,
  }

  return NextResponse.json(response)
}
