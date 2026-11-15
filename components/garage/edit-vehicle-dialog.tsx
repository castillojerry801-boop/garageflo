'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  VEHICLE_TYPE_LABELS,
  TRACKING_METHOD_LABELS,
  type Vehicle,
  type VehicleType,
  type TrackingMethod,
} from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { VehicleCombobox, type ComboboxItem } from '@/components/ui/vehicle-combobox'
import { toast } from 'sonner'
import { Pencil, Loader2 } from 'lucide-react'
import { cn, todayLocalString } from '@/lib/utils'
import { validateVin, HIGHWAY_VIN_TYPES } from '@/lib/vin'
import { VPIC_MAKE_TYPES } from '@/lib/catalog/vpic'

interface EditVehicleDialogProps {
  vehicle: Vehicle
}

function formFromVehicle(v: Vehicle) {
  return {
    name: v.name,
    type: v.type as VehicleType,
    tracking_method: (v.tracking_method ?? 'mileage') as TrackingMethod,
    year: v.year?.toString() ?? '',
    make: v.make ?? '',
    model: v.model ?? '',
    vin: v.vin ?? '',
    mileage: v.mileage?.toString() ?? '',
    mileage_reading_date: v.mileage_as_of ?? todayLocalString(),
    engine_hours: v.engine_hours?.toString() ?? '',
    engine_hours_reading_date: v.engine_hours_as_of ?? todayLocalString(),
    color: v.color ?? '',
    notes: v.notes ?? '',
  }
}

export function EditVehicleDialog({ vehicle }: EditVehicleDialogProps) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [confirmingDownward, setConfirmingDownward] = useState(false)
  const [confirmingDownwardHours, setConfirmingDownwardHours] = useState(false)
  const [form, setForm] = useState(() => formFromVehicle(vehicle))

  const [makes, setMakes] = useState<ComboboxItem[]>([])
  const [models, setModels] = useState<ComboboxItem[]>([])
  const [makesLoading, setMakesLoading] = useState(false)
  const [modelsLoading, setModelsLoading] = useState(false)

  const isCatalogType = (t: VehicleType) => t in VPIC_MAKE_TYPES

  const loadMakes = useCallback(async (vehicleType: VehicleType) => {
    if (!isCatalogType(vehicleType)) {
      setMakes([])
      return
    }
    setMakesLoading(true)
    try {
      const res = await fetch(`/api/catalog/makes?vehicleType=${encodeURIComponent(vehicleType)}`)
      const data = await res.json()
      setMakes(Array.isArray(data.makes) ? data.makes : [])
    } catch {
      setMakes([])
    } finally {
      setMakesLoading(false)
    }
  }, [])

  const loadModels = useCallback(async (make: string, year: string) => {
    if (!make || !year) {
      setModels([])
      return
    }
    setModelsLoading(true)
    try {
      const res = await fetch(`/api/catalog/models?make=${encodeURIComponent(make)}&year=${encodeURIComponent(year)}`)
      const data = await res.json()
      setModels(Array.isArray(data.models) ? data.models : [])
    } catch {
      setModels([])
    } finally {
      setModelsLoading(false)
    }
  }, [])

  // Load makes when dialog opens.
  useEffect(() => {
    if (open) loadMakes(form.type as VehicleType)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load models when make+year are both set.
  useEffect(() => {
    if (open && form.make && form.year) {
      loadModels(form.make, form.year)
    } else {
      setModels([])
    }
  }, [form.make, form.year, open]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleOpenChange(val: boolean) {
    if (!val) {
      setForm(formFromVehicle(vehicle))
      setConfirmingDownward(false)
      setConfirmingDownwardHours(false)
      setMakes([])
      setModels([])
    }
    setOpen(val)
  }

  function handleChange(field: string, value: string) {
    if (field === 'mileage') setConfirmingDownward(false)
    if (field === 'engine_hours') setConfirmingDownwardHours(false)
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleTypeChange(newType: string) {
    const t = newType as VehicleType
    setForm((prev) => ({
      ...prev,
      type: t,
      make: '',
      model: '',
    }))
    setMakes([])
    setModels([])
    loadMakes(t)
  }

  function handleMakeChange(value: string) {
    setForm((prev) => ({ ...prev, make: value, model: '' }))
    setModels([])
  }

  function handleModelChange(value: string) {
    setForm((prev) => ({ ...prev, model: value }))
  }

  function handleYearChange(value: string) {
    setForm((prev) => ({ ...prev, year: value, model: '' }))
    setModels([])
  }

  const showMileage = form.tracking_method === 'mileage' || form.tracking_method === 'both'
  const showHours = form.tracking_method === 'hours' || form.tracking_method === 'both'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      toast.error('Vehicle name is required')
      return
    }

    const newMileage = form.mileage ? parseInt(form.mileage) : null
    const newHours = form.engine_hours ? parseFloat(form.engine_hours) : null

    // Mileage downward correction of a confirmed reading requires a second submit.
    const isDecreasingMileage =
      showMileage &&
      newMileage !== null &&
      vehicle.mileage !== null &&
      !vehicle.mileage_is_estimated &&
      newMileage < vehicle.mileage

    // Hours downward correction of a confirmed reading requires a second submit.
    const isDecreasingHours =
      showHours &&
      newHours !== null &&
      vehicle.engine_hours !== null &&
      !vehicle.engine_hours_is_estimated &&
      newHours < vehicle.engine_hours

    if (isDecreasingMileage && !confirmingDownward) {
      setConfirmingDownward(true)
      return
    }
    if (isDecreasingHours && !confirmingDownwardHours) {
      setConfirmingDownwardHours(true)
      return
    }

    setLoading(true)

    const { error } = await supabase
      .from('vehicles')
      .update({
        type: form.type,
        tracking_method: form.tracking_method,
        name: form.name.trim(),
        year: form.year ? parseInt(form.year) : null,
        make: form.make.trim() || null,
        model: form.model.trim() || null,
        vin: form.vin.trim() || null,
        mileage: showMileage ? newMileage : null,
        mileage_as_of: showMileage && newMileage !== null ? form.mileage_reading_date : null,
        mileage_is_estimated: false,
        engine_hours: showHours ? newHours : null,
        engine_hours_as_of: showHours && newHours !== null ? form.engine_hours_reading_date : null,
        engine_hours_is_estimated: false,
        color: form.color.trim() || null,
        notes: form.notes.trim() || null,
      })
      .eq('id', vehicle.id)
      .eq('user_id', vehicle.user_id)

    setLoading(false)
    if (error) {
      toast.error('Failed to update vehicle')
    } else {
      toast.success('Vehicle updated!')
      setConfirmingDownward(false)
      setConfirmingDownwardHours(false)
      setOpen(false)
      router.refresh()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
        aria-label="Edit vehicle"
      >
        <Pencil className="h-4 w-4" />
      </DialogTrigger>

      <DialogContent className="bg-card border-border max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Edit Vehicle</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="ev-name">Nickname / Name *</Label>
            <Input
              id="ev-name"
              placeholder="e.g. Blue Beast, The Boat"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              required
              className="bg-input border-border"
            />
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={form.type} onValueChange={(v) => v && handleTypeChange(v)}>
              <SelectTrigger className="bg-input border-border w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {Object.entries(VEHICLE_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tracking method — user-overridable */}
          <div className="space-y-2">
            <Label>Track By</Label>
            <Select
              value={form.tracking_method}
              onValueChange={(v) => v && handleChange('tracking_method', v)}
            >
              <SelectTrigger className="bg-input border-border w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {Object.entries(TRACKING_METHOD_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="ev-year">Year</Label>
              <Input
                id="ev-year"
                type="number"
                placeholder="2021"
                min="1885"
                max={new Date().getFullYear() + 2}
                value={form.year}
                onChange={(e) => handleYearChange(e.target.value)}
                className="bg-input border-border"
              />
            </div>
            {isCatalogType(form.type as VehicleType) ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="ev-make">Make</Label>
                  <VehicleCombobox
                    id="ev-make"
                    items={makes}
                    value={form.make}
                    onChange={handleMakeChange}
                    placeholder="Ford"
                    loading={makesLoading}
                    allowManual
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ev-model">Model</Label>
                  <VehicleCombobox
                    id="ev-model"
                    items={models}
                    value={form.model}
                    onChange={handleModelChange}
                    placeholder={!form.make ? 'Set make first' : 'F-150'}
                    loading={modelsLoading}
                    disabled={!form.make}
                    allowManual
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="ev-make">Make</Label>
                  <Input
                    id="ev-make"
                    placeholder="Arctic Cat"
                    value={form.make}
                    onChange={(e) => handleChange('make', e.target.value)}
                    className="bg-input border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ev-model">Model</Label>
                  <Input
                    id="ev-model"
                    placeholder="Model"
                    value={form.model}
                    onChange={(e) => handleChange('model', e.target.value)}
                    className="bg-input border-border"
                  />
                </div>
              </>
            )}
          </div>

          {/* VIN / Serial ID — optional, type-aware */}
          {(() => {
            const isHighway = HIGHWAY_VIN_TYPES.has(form.type)
            const vinValidation = form.vin.trim() ? validateVin(form.vin, form.type) : null
            return (
              <div className="space-y-1.5">
                <Label htmlFor="ev-vin">
                  {isHighway ? 'VIN' : 'Serial / ID Number'}
                </Label>
                <Input
                  id="ev-vin"
                  placeholder={isHighway ? 'e.g. 1HGBH41JXMN109186' : 'e.g. M17AH1234A56'}
                  value={form.vin}
                  onChange={(e) => handleChange('vin', e.target.value.toUpperCase())}
                  className="bg-input border-border tracking-wider"
                  autoComplete="off"
                />
                <p className="text-[11px] text-muted-foreground">
                  {isHighway
                    ? 'Optional — standard VINs are 17 characters. Used only for the official NHTSA recall lookup.'
                    : 'Optional — may help verify recall eligibility with the manufacturer.'}
                </p>
                {vinValidation?.state === 'nonstandard' && (
                  <p className="text-[11px] text-warning/80 leading-relaxed">
                    Standard VINs are 17 characters. If this is an older vehicle or uses a
                    different format, it will be saved as entered.
                  </p>
                )}
                {vinValidation?.state === 'invalid_chars' && (
                  <p className="text-[11px] text-danger/80 leading-relaxed">
                    {vinValidation.invalidChars
                      ? `VINs cannot contain ${vinValidation.invalidChars} — these letters are excluded to avoid confusion with 1 and 0.`
                      : 'This does not appear to be a valid VIN. Standard VINs use letters A–H, J–N, P–R, Z and digits 0–9.'}
                  </p>
                )}
              </div>
            )
          })()}

          {/* Mileage with optional reading date */}
          {showMileage && (
            <div className="space-y-2">
              <Label htmlFor="ev-mileage">Mileage</Label>
              <Input
                id="ev-mileage"
                type="number"
                placeholder="45000"
                min="0"
                value={form.mileage}
                onChange={(e) => handleChange('mileage', e.target.value)}
                className={cn(
                  'bg-input border-border',
                  confirmingDownward && 'border-warning/60 focus-visible:ring-warning/30'
                )}
              />
              {form.mileage && (
                <div className="space-y-1">
                  <Label htmlFor="ev-mileage-date" className="text-[11px] text-muted-foreground/70">
                    Reading date
                  </Label>
                  <Input
                    id="ev-mileage-date"
                    type="date"
                    value={form.mileage_reading_date}
                    onChange={(e) => handleChange('mileage_reading_date', e.target.value)}
                    className="bg-input border-border text-xs h-8"
                  />
                </div>
              )}
              {confirmingDownward && (
                <p className="text-sm text-warning bg-warning/10 border border-warning/30 rounded-lg px-3 py-2.5 leading-relaxed">
                  This will decrease the confirmed mileage from{' '}
                  <strong className="text-foreground">{vehicle.mileage?.toLocaleString()} mi</strong> to{' '}
                  <strong className="text-foreground">
                    {parseInt(form.mileage).toLocaleString()} mi
                  </strong>. Click <em>Confirm Reduction</em> to proceed.
                </p>
              )}
            </div>
          )}

          {/* Engine hours with optional reading date */}
          {showHours && (
            <div className="space-y-2">
              <Label htmlFor="ev-hours">Engine Hours</Label>
              <Input
                id="ev-hours"
                type="number"
                placeholder="250.5"
                min="0"
                step="0.1"
                value={form.engine_hours}
                onChange={(e) => handleChange('engine_hours', e.target.value)}
                className={cn(
                  'bg-input border-border',
                  confirmingDownwardHours && 'border-warning/60 focus-visible:ring-warning/30'
                )}
              />
              {form.engine_hours && (
                <div className="space-y-1">
                  <Label htmlFor="ev-hours-date" className="text-[11px] text-muted-foreground/70">
                    Reading date
                  </Label>
                  <Input
                    id="ev-hours-date"
                    type="date"
                    value={form.engine_hours_reading_date}
                    onChange={(e) => handleChange('engine_hours_reading_date', e.target.value)}
                    className="bg-input border-border text-xs h-8"
                  />
                </div>
              )}
              {confirmingDownwardHours && (
                <p className="text-sm text-warning bg-warning/10 border border-warning/30 rounded-lg px-3 py-2.5 leading-relaxed">
                  This will decrease the confirmed hours from{' '}
                  <strong className="text-foreground">{vehicle.engine_hours?.toLocaleString()} hrs</strong> to{' '}
                  <strong className="text-foreground">
                    {parseFloat(form.engine_hours).toLocaleString()} hrs
                  </strong>. Click <em>Confirm Reduction</em> to proceed.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="ev-color">Color</Label>
              <Input
                id="ev-color"
                placeholder="Black"
                value={form.color}
                onChange={(e) => handleChange('color', e.target.value)}
                className="bg-input border-border"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ev-notes">Notes</Label>
            <Textarea
              id="ev-notes"
              placeholder="Any notes about this vehicle..."
              value={form.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={3}
              className="bg-input border-border resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 border-border hover:bg-secondary"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className={cn(
                'flex-1 font-bold',
                (confirmingDownward || confirmingDownwardHours)
                  ? 'bg-warning text-black hover:bg-warning/90'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              )}
              disabled={loading}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {(confirmingDownward || confirmingDownwardHours) ? 'Confirm Reduction' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
