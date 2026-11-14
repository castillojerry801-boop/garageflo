'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { VEHICLE_TYPE_LABELS, VehicleType } from '@/types'
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

export function AddVehicleDialog({ garageId, userId }: AddVehicleDialogProps) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '',
    type: 'car' as VehicleType,
    year: '',
    make: '',
    model: '',
    mileage: '',
    color: '',
    notes: '',
  })

  function handleChange(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

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
      name: form.name.trim(),
      year: form.year ? parseInt(form.year) : null,
      make: form.make.trim() || null,
      model: form.model.trim() || null,
      mileage: form.mileage ? parseInt(form.mileage) : null,
      color: form.color.trim() || null,
      notes: form.notes.trim() || null,
    })

    if (error) {
      toast.error('Failed to add vehicle')
      setLoading(false)
    } else {
      toast.success(`${form.name} added to your garage!`)
      setOpen(false)
      setForm({ name: '', type: 'car', year: '', make: '', model: '', mileage: '', color: '', notes: '' })
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className="group relative bg-card border-2 border-dashed border-border rounded-2xl overflow-hidden transition-all duration-200 hover:border-primary/50 hover:bg-primary/5 min-h-[200px] flex flex-col items-center justify-center gap-3 w-full p-4"
      >
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
          <Plus className="h-6 w-6 text-primary" />
        </div>
        <span className="text-sm font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
          Add Vehicle
        </span>
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
            <Select value={form.type} onValueChange={(v) => handleChange('type', v ?? 'car')}>
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

          <div className="grid grid-cols-2 gap-3">
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
            <div className="space-y-2">
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
