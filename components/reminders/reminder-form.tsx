'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { COMMON_SERVICE_TYPES } from '@/types'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

interface ReminderFormProps {
  vehicleId: string
}

export function ReminderForm({ vehicleId }: ReminderFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    service_type: '',
    custom_service: '',
    next_due_date: '',
    next_due_mileage: '',
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
    if (!form.next_due_date && !form.next_due_mileage) {
      toast.error('Set a due date or mileage')
      return
    }
    setLoading(true)

    const { error } = await supabase.from('reminders').insert({
      vehicle_id: vehicleId,
      service_type: serviceType.trim(),
      next_due_date: form.next_due_date || null,
      next_due_mileage: form.next_due_mileage ? parseInt(form.next_due_mileage) : null,
      is_active: true,
    })

    if (error) {
      toast.error('Failed to set reminder')
    } else {
      toast.success('Reminder set!')
      setOpen(false)
      setForm({ service_type: '', custom_service: '', next_due_date: '', next_due_mileage: '' })
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={cn(buttonVariants(), 'bg-primary text-primary-foreground hover:bg-primary/90 font-bold gap-2')}>
        <Plus className="h-4 w-4" />
        Add Reminder
      </DialogTrigger>

      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Set a Reminder</DialogTitle>
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

          <p className="text-xs text-muted-foreground">Set a due date, mileage, or both.</p>

          <div className="space-y-2">
            <Label htmlFor="next_due_date">Due By Date</Label>
            <Input
              id="next_due_date"
              type="date"
              value={form.next_due_date}
              onChange={(e) => handleChange('next_due_date', e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="bg-input border-border"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="next_due_mileage">Due By Mileage</Label>
            <Input
              id="next_due_mileage"
              type="number"
              placeholder="e.g. 50000"
              min="0"
              value={form.next_due_mileage}
              onChange={(e) => handleChange('next_due_mileage', e.target.value)}
              className="bg-input border-border"
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
              Set Reminder
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
