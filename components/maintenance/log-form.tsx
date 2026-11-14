'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { COMMON_SERVICE_TYPES } from '@/types'
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
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

interface LogFormProps {
  vehicleId: string
}

export function LogForm({ vehicleId }: LogFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const serviceType = form.service_type === 'Other' ? form.custom_service : form.service_type
    if (!serviceType.trim()) {
      toast.error('Service type is required')
      return
    }
    setLoading(true)

    const { error } = await supabase.from('maintenance_logs').insert({
      vehicle_id: vehicleId,
      service_type: serviceType.trim(),
      performed_at: form.performed_at,
      mileage_at_service: form.mileage_at_service ? parseInt(form.mileage_at_service) : null,
      cost: form.cost ? parseFloat(form.cost) : null,
      notes: form.notes.trim() || null,
    })

    if (error) {
      toast.error('Failed to log service')
    } else {
      toast.success('Service logged!')
      setOpen(false)
      setForm({
        service_type: '', custom_service: '',
        performed_at: new Date().toISOString().split('T')[0],
        mileage_at_service: '', cost: '', notes: '',
      })
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={cn(buttonVariants(), 'bg-primary text-primary-foreground hover:bg-primary/90 font-bold gap-2')}>
        <Plus className="h-4 w-4" />
        Log Service
      </DialogTrigger>

      <DialogContent className="bg-card border-border max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Log a Service</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>Service Type *</Label>
            <Select value={form.service_type} onValueChange={(v) => handleChange('service_type', v ?? '')}>
              <SelectTrigger className="bg-input border-border w-full">
                <SelectValue placeholder="Select service..." />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {COMMON_SERVICE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.service_type === 'Other' && (
              <Input
                placeholder="Describe the service..."
                value={form.custom_service}
                onChange={(e) => handleChange('custom_service', e.target.value)}
                className="bg-input border-border"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="performed_at">Date Performed</Label>
            <Input
              id="performed_at"
              type="date"
              value={form.performed_at}
              onChange={(e) => handleChange('performed_at', e.target.value)}
              className="bg-input border-border"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="mileage">Mileage</Label>
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
            <div className="space-y-2">
              <Label htmlFor="cost">Cost ($)</Label>
              <Input
                id="cost"
                type="number"
                placeholder="89.99"
                min="0"
                step="0.01"
                value={form.cost}
                onChange={(e) => handleChange('cost', e.target.value)}
                className="bg-input border-border"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Any notes about this service..."
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
              Save Log
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
