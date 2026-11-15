'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { VEHICLE_TYPE_LABELS, type Vehicle, type VehicleType } from '@/types'
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
import { toast } from 'sonner'
import { Pencil, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EditVehicleDialogProps {
  vehicle: Vehicle
}

function formFromVehicle(v: Vehicle) {
  return {
    name: v.name,
    type: v.type as VehicleType,
    year: v.year?.toString() ?? '',
    make: v.make ?? '',
    model: v.model ?? '',
    mileage: v.mileage?.toString() ?? '',
    mileage_reading_date: v.mileage_as_of ?? new Date().toISOString().split('T')[0],
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
  const [form, setForm] = useState(() => formFromVehicle(vehicle))

  function handleOpenChange(val: boolean) {
    if (!val) {
      setForm(formFromVehicle(vehicle))
      setConfirmingDownward(false)
    }
    setOpen(val)
  }

  function handleChange(field: string, value: string) {
    // Reset downward confirmation whenever mileage is re-edited.
    if (field === 'mileage') setConfirmingDownward(false)
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      toast.error('Vehicle name is required')
      return
    }

    const newMileage = form.mileage ? parseInt(form.mileage) : null

    // Downward correction of a confirmed reading requires a second submit.
    const isDecreasingConfirmed =
      newMileage !== null &&
      vehicle.mileage !== null &&
      !vehicle.mileage_is_estimated &&
      newMileage < vehicle.mileage

    if (isDecreasingConfirmed && !confirmingDownward) {
      setConfirmingDownward(true)
      return
    }

    setLoading(true)

    const { error } = await supabase
      .from('vehicles')
      .update({
        type: form.type,
        name: form.name.trim(),
        year: form.year ? parseInt(form.year) : null,
        make: form.make.trim() || null,
        model: form.model.trim() || null,
        mileage: newMileage,
        mileage_as_of: newMileage !== null ? form.mileage_reading_date : null,
        mileage_is_estimated: false,
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
            <Select value={form.type} onValueChange={(v) => handleChange('type', v ?? form.type)}>
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
                onChange={(e) => handleChange('year', e.target.value)}
                className="bg-input border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ev-make">Make</Label>
              <Input
                id="ev-make"
                placeholder="Ford"
                value={form.make}
                onChange={(e) => handleChange('make', e.target.value)}
                className="bg-input border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ev-model">Model</Label>
              <Input
                id="ev-model"
                placeholder="F-150"
                value={form.model}
                onChange={(e) => handleChange('model', e.target.value)}
                className="bg-input border-border"
              />
            </div>
          </div>

          {/* Mileage with optional reading date */}
          <div className="grid grid-cols-2 gap-3">
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
            </div>
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

          {/* Downward correction warning */}
          {confirmingDownward && (
            <div className="text-sm text-warning bg-warning/10 border border-warning/30 rounded-lg px-3 py-2.5 leading-relaxed">
              This will decrease the confirmed mileage from{' '}
              <strong className="text-foreground">{vehicle.mileage?.toLocaleString()} mi</strong> to{' '}
              <strong className="text-foreground">
                {parseInt(form.mileage).toLocaleString()} mi
              </strong>. Click <em>Confirm Reduction</em> to proceed.
            </div>
          )}

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
                confirmingDownward
                  ? 'bg-warning text-black hover:bg-warning/90'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              )}
              disabled={loading}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {confirmingDownward ? 'Confirm Reduction' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
