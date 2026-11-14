'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
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
import { toast } from 'sonner'
import { Plus, Loader2, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LogFormProps {
  vehicleId: string
}

// Quick-select chips for the most common service types
const QUICK_SERVICES = [
  'Oil Change',
  'Tire Rotation',
  'Brake Inspection',
  'Air Filter',
  'Spark Plugs',
  'Battery',
  'Annual Inspection',
  'Other',
]

export function LogForm({ vehicleId }: LogFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showOptional, setShowOptional] = useState(false)
  const [form, setForm] = useState({
    service_type: '',
    custom_service: '',
    performed_at: new Date().toISOString().split('T')[0],
    mileage_at_service: '',
    cost: '',
    notes: '',
  })

  function handleChange(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleClose() {
    setOpen(false)
    setShowOptional(false)
    setForm({
      service_type: '', custom_service: '',
      performed_at: new Date().toISOString().split('T')[0],
      mileage_at_service: '', cost: '', notes: '',
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const serviceType = form.service_type === 'Other'
      ? form.custom_service.trim()
      : form.service_type
    if (!serviceType) {
      toast.error('Select or enter a service type')
      return
    }
    setLoading(true)

    const { error } = await supabase.from('maintenance_logs').insert({
      vehicle_id: vehicleId,
      service_type: serviceType,
      performed_at: form.performed_at,
      mileage_at_service: form.mileage_at_service ? parseInt(form.mileage_at_service) : null,
      cost: form.cost ? parseFloat(form.cost) : null,
      notes: form.notes.trim() || null,
    })

    if (error) {
      toast.error('Failed to log service')
    } else {
      toast.success('Service logged!')
      handleClose()
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true) }}>
      <DialogTrigger className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Plus className="h-4 w-4" />
        Log Service
      </DialogTrigger>

      <DialogContent className="bg-card border-border max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Log a Service</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-1">

          {/* Service type — quick chips */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Service Type</Label>
            <div className="flex flex-wrap gap-2">
              {QUICK_SERVICES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleChange('service_type', type)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                    form.service_type === type
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-secondary/50 text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
            {/* Less common services — compact select */}
            {!QUICK_SERVICES.includes(form.service_type) && form.service_type && (
              <p className="text-xs text-muted-foreground px-1">Selected: <strong>{form.service_type}</strong></p>
            )}
            {form.service_type === 'Other' && (
              <Input
                placeholder="Describe the service..."
                value={form.custom_service}
                onChange={(e) => handleChange('custom_service', e.target.value)}
                className="bg-input border-border mt-2"
                autoFocus
              />
            )}
          </div>

          {/* Date — always visible and prominent */}
          <div className="space-y-1.5">
            <Label htmlFor="performed_at" className="text-sm font-semibold">Date Performed</Label>
            <Input
              id="performed_at"
              type="date"
              value={form.performed_at}
              onChange={(e) => handleChange('performed_at', e.target.value)}
              className="bg-input border-border"
            />
          </div>

          {/* Optional fields — collapsed by default */}
          <div>
            <button
              type="button"
              onClick={() => setShowOptional(v => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showOptional && 'rotate-180')} />
              {showOptional ? 'Hide' : 'Add'} mileage, cost & notes
            </button>

            {showOptional && (
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="mileage" className="text-xs text-muted-foreground">Mileage</Label>
                    <Input
                      id="mileage"
                      type="number"
                      placeholder="45,000"
                      min="0"
                      value={form.mileage_at_service}
                      onChange={(e) => handleChange('mileage_at_service', e.target.value)}
                      className="bg-input border-border"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cost" className="text-xs text-muted-foreground">Cost ($)</Label>
                    <Input
                      id="cost"
                      type="number"
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      value={form.cost}
                      onChange={(e) => handleChange('cost', e.target.value)}
                      className="bg-input border-border"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="notes" className="text-xs text-muted-foreground">Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Parts replaced, shop name, observations..."
                    value={form.notes}
                    onChange={(e) => handleChange('notes', e.target.value)}
                    rows={3}
                    className="bg-input border-border resize-none text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              className="flex-1 border-border hover:bg-secondary"
              onClick={handleClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
              disabled={loading}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
