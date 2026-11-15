import { NextResponse } from 'next/server'
import { fetchModels } from '@/lib/catalog/vpic'
import { getModelSupplement } from '@/lib/catalog/model-supplement'

const CURRENT_YEAR = new Date().getFullYear()
const MIN_YEAR = 1885
const MAX_YEAR = CURRENT_YEAR + 2

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const make = searchParams.get('make')?.trim()
  const yearParam = searchParams.get('year')?.trim()

  if (!make || !yearParam) {
    return NextResponse.json({ error: 'make and year are required' }, { status: 400 })
  }

  const year = parseInt(yearParam, 10)
  if (isNaN(year) || year < MIN_YEAR || year > MAX_YEAR) {
    return NextResponse.json({ error: 'year out of range' }, { status: 400 })
  }

  const rawModels = await fetchModels(make, year)

  // Expand any models that have sub-model supplements, replacing the base entry.
  const expanded: Array<{ id: number | string; name: string }> = []
  let hasSubmodels = false

  for (const m of rawModels) {
    const sub = getModelSupplement(make, m.name, year)
    if (sub) {
      hasSubmodels = true
      sub.forEach((name, i) => expanded.push({ id: `${m.id}_sub${i}`, name }))
    } else {
      expanded.push(m)
    }
  }

  // Re-sort after expansion (supplements may insert out-of-order entries).
  expanded.sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json({ models: expanded, hasSubmodels })
}
