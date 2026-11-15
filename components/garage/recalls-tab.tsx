'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  ShieldAlert, ShieldCheck, AlertTriangle, Loader2,
  ExternalLink, Info, ChevronDown, ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { VehicleType } from '@/types'
import type { RecallsApiResponse, RecallResult, ProviderResult } from '@/lib/recalls/types'

interface RecallsTabProps {
  vehicleId: string
  vehicleName: string
  vehicleType: VehicleType
  make: string | null
  year: number | null
  model: string | null
  vin: string | null
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function RecallCard({ recall }: { recall: RecallResult }) {
  const [expanded, setExpanded] = useState(false)
  const isPossible = recall.confidence === 'possible'

  return (
    <div className={cn(
      'border rounded-xl p-4 space-y-2',
      isPossible ? 'border-warning/40 bg-warning/5' : 'border-danger/40 bg-danger/5',
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            {isPossible ? (
              <span className="text-[10px] font-semibold uppercase tracking-widest text-warning/80 bg-warning/10 border border-warning/30 px-1.5 py-0.5 rounded">
                Possible related recall
              </span>
            ) : (
              <span className="text-[10px] font-semibold uppercase tracking-widest text-danger/80 bg-danger/10 border border-danger/30 px-1.5 py-0.5 rounded">
                Model match
              </span>
            )}
            <span className="text-[10px] text-muted-foreground tabular-nums">{recall.date}</span>
          </div>
          <p className="text-sm font-semibold text-foreground leading-snug">{recall.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{recall.affectedProducts}</p>
        </div>
      </div>

      {recall.hazard && (
        <div className="rounded-lg bg-background/60 border border-border/50 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-0.5">Safety Hazard</p>
          <p className="text-xs text-foreground leading-relaxed">{recall.hazard}</p>
        </div>
      )}

      {expanded && recall.remedy && (
        <div className="rounded-lg bg-background/60 border border-border/50 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-0.5">Remedy</p>
          <p className="text-xs text-foreground leading-relaxed">{recall.remedy}</p>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap pt-0.5">
        <a
          href={recall.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          View official recall
          <ExternalLink className="h-3 w-3" />
        </a>
        {recall.remedy && (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <><ChevronUp className="h-3 w-3" />Hide remedy</> : <><ChevronDown className="h-3 w-3" />Show remedy</>}
          </button>
        )}
      </div>
    </div>
  )
}

function ProviderSection({
  result,
  vehicleName,
  vin,
}: {
  result: ProviderResult
  vehicleName: string
  vin: string | null
}) {
  const providerLabel = result.provider === 'nhtsa' ? 'NHTSA' : 'CPSC'
  const providerUrl = result.provider === 'nhtsa'
    ? 'https://www.nhtsa.gov/recalls'
    : 'https://www.cpsc.gov/Recalls'

  // CPSC scope notice — always shown so users know the search is bounded.
  const cpscScopeNotice = result.provider === 'cpsc' && result.searchFromYear != null
    ? `Searched CPSC recalls from ${result.searchFromYear} to present.`
    : null

  if (result.status === 'incomplete_data') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-secondary/30 px-4 py-3.5">
        <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {providerLabel} check requires {result.missingFields?.join(', ')}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Edit this vehicle to add the missing information, then check again.
          </p>
        </div>
      </div>
    )
  }

  if (result.status === 'vehicle_not_found') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-secondary/30 px-4 py-3.5">
        <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Vehicle not found in NHTSA database</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            NHTSA did not recognize this year/make/model combination. This does not confirm
            the absence of recalls. Verify that your make and model match NHTSA&apos;s exact vehicle
            naming, or search directly.
          </p>
          <a
            href="https://www.nhtsa.gov/recalls"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 mt-1.5 transition-colors"
          >
            Search NHTSA recalls <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    )
  }

  if (result.status === 'provider_error') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/5 px-4 py-3.5">
        <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{providerLabel} is temporarily unavailable</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            This does not mean there are no recalls.{' '}
            <a href={providerUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">
              Search {providerLabel} directly <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        </div>
      </div>
    )
  }

  if (result.status === 'rate_limited') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-secondary/30 px-4 py-3.5">
        <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">{providerLabel} rate limit reached. Try again in a moment.</p>
      </div>
    )
  }

  // status === 'ok'
  if (result.recalls.length === 0) {
    return (
      <div className="rounded-xl border border-border/50 bg-secondary/20 px-4 py-4 space-y-1.5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-success shrink-0" />
          <p className="text-sm font-medium text-foreground">No {providerLabel} recalls found</p>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {cpscScopeNotice
            ? `${cpscScopeNotice} No matching recalls found in that period. `
            : `No matching ${providerLabel} recalls found. `}
          This does not confirm {vehicleName} has no active recalls.
          {' '}
          <a href={providerUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">
            {cpscScopeNotice ? 'Search full CPSC history' : `Search ${providerLabel} directly`} <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-danger shrink-0" />
          <p className="text-sm font-semibold text-foreground">
            {result.recalls.length} {providerLabel} recall{result.recalls.length !== 1 ? 's' : ''} found
          </p>
        </div>
        <a
          href={providerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 transition-colors"
        >
          {providerLabel} <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* Safety disclaimer — always shown when recalls are present */}
      <div className="rounded-lg border border-border/50 bg-secondary/30 px-3 py-2.5 space-y-1.5">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">These are model-level potential matches.</strong>{' '}
          Whether your specific {vehicleName} is affected depends on its VIN, serial number,
          or manufacture date. Verify eligibility using the official recall link before taking action.
        </p>
        {result.provider === 'nhtsa' && vin && (
          <a
            href={`https://www.nhtsa.gov/vehicle/${encodeURIComponent(vin)}/check-recalls`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          >
            Check this VIN on NHTSA <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {result.provider === 'nhtsa' && !vin && (
          <p className="text-xs text-muted-foreground">
            Add your VIN to this vehicle for a VIN-specific NHTSA check.
          </p>
        )}
        {result.provider === 'cpsc' && (
          <p className="text-xs text-muted-foreground">
            For equipment, check the manufacturer&apos;s serial number lookup to confirm eligibility.
          </p>
        )}
        {cpscScopeNotice && (
          <p className="text-xs text-muted-foreground">
            {cpscScopeNotice}{' '}
            <a href="https://www.cpsc.gov/Recalls" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">
              Search full CPSC history <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        )}
      </div>

      {result.recalls.map(r => (
        <RecallCard key={`${r.provider}-${r.id}`} recall={r} />
      ))}
    </div>
  )
}

export function RecallsTab({
  vehicleId,
  vehicleName,
  vehicleType,
  make,
  year,
  model,
  vin,
}: RecallsTabProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<RecallsApiResponse | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const isNhtsaType = ['car', 'truck', 'suv', 'motorcycle', 'trailer', 'camp_trailer'].includes(vehicleType)
  const isUscgType = ['boat', 'personal_watercraft'].includes(vehicleType)

  async function checkRecalls() {
    setStatus('loading')
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/recalls?vehicleId=${encodeURIComponent(vehicleId)}`)
      if (!res.ok) {
        throw new Error(`${res.status}`)
      }
      const data: RecallsApiResponse = await res.json()
      setResult(data)
      setStatus('done')
    } catch {
      setErrorMsg('Could not reach the recall service. Try again.')
      setStatus('error')
    }
  }

  // ── Idle state ──
  if (status === 'idle') {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-border/60 bg-card px-5 py-5 space-y-3.5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Safety Recall Check</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {isNhtsaType
                  ? 'Searches NHTSA\'s official recall database using the year, make, and model you\'ve entered.'
                  : isUscgType
                  ? 'Searches CPSC\'s recall database (last 10 years). For marine recalls, also check USCG directly.'
                  : 'Searches CPSC\'s official recall database (last 10 years) using the manufacturer name you\'ve entered.'}
              </p>
            </div>
          </div>

          {/* Show what fields will be used */}
          {(make || year || model) && (
            <div className="flex flex-wrap gap-1.5">
              {year && <span className="text-[11px] bg-secondary/60 border border-border/50 px-2 py-0.5 rounded-full text-muted-foreground">{year}</span>}
              {make && <span className="text-[11px] bg-secondary/60 border border-border/50 px-2 py-0.5 rounded-full text-muted-foreground">{make}</span>}
              {model && <span className="text-[11px] bg-secondary/60 border border-border/50 px-2 py-0.5 rounded-full text-muted-foreground">{model}</span>}
            </div>
          )}

          <Button
            size="sm"
            onClick={checkRecalls}
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
          >
            <ShieldAlert className="h-3.5 w-3.5 mr-1.5" />
            Check Recalls
          </Button>
        </div>

        {isUscgType && <UscgLinkCard />}
      </div>
    )
  }

  // ── Loading state ──
  if (status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center py-14 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Checking official recall databases…</p>
      </div>
    )
  }

  // ── Error state ──
  if (status === 'error') {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/5 px-4 py-3.5">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground">Could not check recalls</p>
            <p className="text-xs text-muted-foreground mt-0.5">{errorMsg}</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={checkRecalls} className="border-border/70">
          Try Again
        </Button>
      </div>
    )
  }

  // ── Done state ──
  if (!result) return null

  const fetchedAt = formatTime(result.fetchedAt)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Last checked {fetchedAt}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={checkRecalls}
          className="border-border/70 text-muted-foreground hover:text-foreground h-7 text-xs px-2.5"
        >
          Check Again
        </Button>
      </div>

      {result.providers.map(pr => (
        <ProviderSection key={pr.provider} result={pr} vehicleName={vehicleName} vin={vin} />
      ))}

      {result.showUscgLink && <UscgLinkCard />}
    </div>
  )
}

function UscgLinkCard() {
  return (
    <div className="rounded-xl border border-border/60 bg-card px-4 py-4 space-y-1.5">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-primary shrink-0" />
        <p className="text-sm font-semibold text-foreground">Also check USCG Marine Recalls</p>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        The U.S. Coast Guard maintains a separate database for boat and personal watercraft
        safety recalls. USCG does not provide an automated search API — search their official
        database directly.
      </p>
      <a
        href="https://www.uscgboating.org/content/recalls.php"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors mt-0.5"
      >
        Search USCG Marine Recalls <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  )
}
