'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  VEHICLE_TYPE_LABELS,
  TRACKING_METHOD_DEFAULTS,
  TRACKING_METHOD_LABELS,
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
import { toast } from 'sonner'
import { Plus, Loader2 } from 'lucide-react'

interface AddVehicleDialogProps {
  garageId: string
  userId: string
}

const DEFAULT_TYPE: VehicleType = 'car'

export function AddVehicleDialog({ garageId, userId }: AddVehicleDialogProps) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '',
    type: DEFAULT_TYPE,
    tracking_method: TRACKING_METHOD_DEFAULTS[DEFAULT_TYPE] as TrackingMethod,
    year: '',
    make: '',
    model: '',
    mileage: '',
    engine_hours: '',
    color: '',
    notes: '',
  })

  function handleChange(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleTypeChange(newType: string) {
    const t = newType as VehicleType
    setForm((prev) => ({
      ...prev,
      type: t,
      tracking_method: TRACKING_METHOD_DEFAULTS[t],
    }))
  }

  const showMileage = form.tracking_method === 'mileage' || form.tracking_method === 'both'
  const showHours = form.tracking_method === 'hours' || form.tracking_method === 'both'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      toast.error('Vehicle name is required')
      return
    }
    setLoading(true)

    const { error } = await supabase.from('vehicles').insert({
      garage_id: garageId,
      user_id: userId,
      type: form.type,
      tracking_method: form.tracking_method,
      name: form.name.trim(),
      year: form.year ? parseInt(form.year) : null,
      make: form.make.trim() || null,
      model: form.model.trim() || null,
      mileage: showMileage && form.mileage ? parseInt(form.mileage) : null,
      engine_hours: showHours && form.engine_hours ? parseFloat(form.engine_hours) : null,
      color: form.color.trim() || null,
      notes: form.notes.trim() || null,
    })

    if (error) {
      toast.error('Failed to add vehicle')
      setLoading(false)
    } else {
      toast.success(`${form.name} added to your garage!`)
      setOpen(false)
      setForm({
        name: '', type: DEFAULT_TYPE,
        tracking_method: TRACKING_METHOD_DEFAULTS[DEFAULT_TYPE],
        year: '', make: '', model: '', mileage: '', engine_hours: '', color: '', notes: '',
      })
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Plus className="h-4 w-4" />
        Add Vehicle
      </DialogTrigger>

      <DialogContent className="bg-card border-border max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Add to Garage</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="name">Nickname / Name *</Label>
            <Input
              id="name"
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

          {/* Tracking method — user-overridable, defaults from type */}
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
              <Label htmlFor="year">Year</Label>
              <Input
                id="year"
                type="number"
                placeholder="2021"
                min="1900"
                max={new Date().getFullYear() + 2}
                value={form.year}
                onChange={(e) => handleChange('year', e.target.value)}
                className="bg-input border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="make">Make</Label>
              <Input
                id="make"
                placeholder="Ford"
                value={form.make}
                onChange={(e) => handleChange('make', e.target.value)}
                className="bg-input border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">Model</Label>
              <Input
                id="model"
                placeholder="F-150"
                value={form.model}
                onChange={(e) => handleChange('model', e.target.value)}
                className="bg-input border-border"
              />
            </div>
          </div>

          {/* Usage readings — shown conditionally */}
          <div className="grid grid-cols-2 gap-3">
            {showMileage && (
              <div className="space-y-2">
                <Label htmlFor="mileage">Mileage</Label>
                <Input
                  id="mileage"
                  type="number"
                  placeholder="45000"
                  min="0"
                  value={form.mileage}
                  onChange={(e) => handleChange('mileage', e.target.value)}
                  className="bg-input border-border"
                />
              </div>
            )}
            {showHours && (
              <div className="space-y-2">
                <Label htmlFor="engine_hours">Engine Hours</Label>
                <Input
                  id="engine_hours"
                  type="number"
                  placeholder="250.5"
                  min="0"
                  step="0.1"
                  value={form.engine_hours}
                  onChange={(e) => handleChange('engine_hours', e.target.value)}
                  className="bg-input border-border"
                />
              </div>
            )}
            <div className={showMileage || showHours ? 'space-y-2' : 'col-span-2 space-y-2'}>
              <Label htmlFor="color">Color</Label>
              <Input
                id="color"
                placeholder="Black"
                value={form.color}
                onChange={(e) => handleChange('color', e.target.value)}
                className="bg-input border-border"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
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
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Add to Garage
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
