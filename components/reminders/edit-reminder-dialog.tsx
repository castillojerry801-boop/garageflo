'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { COMMON_SERVICE_TYPES, type Reminder } from '@/types'
import { Button } from '@/components/ui/button'
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
import { Pencil, Loader2 } from 'lucide-react'

interface EditReminderDialogProps {
  reminder: Reminder
}

function formFromReminder(r: Reminder) {
  const inCommon = COMMON_SERVICE_TYPES.includes(r.service_type)
  return {
    service_type: inCommon ? r.service_type : 'Other',
    custom_service: inCommon ? '' : r.service_type,
    next_due_date: r.next_due_date ?? '',
    next_due_mileage: r.next_due_mileage?.toString() ?? '',
    next_due_hours: r.next_due_hours?.toString() ?? '',
    interval_months: r.interval_months?.toString() ?? '',
    interval_miles: r.interval_miles?.toString() ?? '',
    interval_hours: r.interval_hours?.toString() ?? '',
    notify_miles_before: r.notify_miles_before?.toString() ?? '',
    notify_hours_before: r.notify_hours_before?.toString() ?? '',
  }
}

export function EditReminderDialog({ reminder }: EditReminderDialogProps) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(() => formFromReminder(reminder))

  function handleOpenChange(val: boolean) {
    if (!val) setForm(formFromReminder(reminder))
    setOpen(val)
  }

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
    if (!form.next_due_date && !form.next_due_mileage && !form.next_due_hours) {
      toast.error('Set a due date, mileage, or engine hours')
      return
    }
    setLoading(true)

    const { error } = await supabase
      .from('reminders')
      .update({
        service_type: serviceType.trim(),
        next_due_date: form.next_due_date || null,
        next_due_mileage: form.next_due_mileage ? parseInt(form.next_due_mileage) : null,
        next_due_hours: form.next_due_hours ? parseFloat(form.next_due_hours) : null,
        interval_months: form.interval_months ? parseInt(form.interval_months) : null,
        interval_miles: form.interval_miles ? parseInt(form.interval_miles) : null,
        interval_hours: form.interval_hours ? parseFloat(form.interval_hours) : null,
        notify_miles_before: form.notify_miles_before ? parseInt(form.notify_miles_before) : null,
        notify_hours_before: form.notify_hours_before ? parseFloat(form.notify_hours_before) : null,
      })
      .eq('id', reminder.id)

    setLoading(false)
    if (error) {
      toast.error('Failed to update reminder')
    } else {
      toast.success('Reminder updated!')
      setOpen(false)
      router.refresh()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        className="inline-flex items-center justify-center h-7 w-7 rounded text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors"
        aria-label="Edit reminder"
      >
        <Pencil className="h-3.5 w-3.5" />
      </DialogTrigger>

      <DialogContent className="bg-card border-border max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Edit Reminder</DialogTitle>
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

          <p className="text-xs text-muted-foreground">Set any combination of due date, mileage, or engine hours.</p>

          <div className="space-y-2">
            <Label htmlFor="er-next_due_date">Due By Date</Label>
            <Input
              id="er-next_due_date"
              type="date"
              value={form.next_due_date}
              onChange={(e) => handleChange('next_due_date', e.target.value)}
              className="bg-input border-border"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="er-next_due_mileage">Due At Mileage</Label>
              <Input
                id="er-next_due_mileage"
                type="number"
                placeholder="e.g. 50000"
                min="0"
                value={form.next_due_mileage}
                onChange={(e) => handleChange('next_due_mileage', e.target.value)}
                className="bg-input border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="er-next_due_hours">Due At Hours</Label>
              <Input
                id="er-next_due_hours"
                type="number"
                placeholder="e.g. 300"
                min="0"
                step="0.1"
                value={form.next_due_hours}
                onChange={(e) => handleChange('next_due_hours', e.target.value)}
                className="bg-input border-border"
              />
            </div>
          </div>

          {/* Recurring intervals */}
          <details className="group" open={!!(form.interval_miles || form.interval_hours || form.interval_months)}>
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground transition-colors list-none flex items-center gap-1.5">
              <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
              Recurring intervals
            </summary>
            <div className="space-y-3 mt-3 pl-4 border-l border-border/40">
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="er-interval_miles" className="text-[11px] text-muted-foreground">Every (mi)</Label>
                  <Input
                    id="er-interval_miles"
                    type="number"
                    placeholder="5000"
                    min="1"
                    value={form.interval_miles}
                    onChange={(e) => handleChange('interval_miles', e.target.value)}
                    className="bg-input border-border h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="er-interval_hours" className="text-[11px] text-muted-foreground">Every (hrs)</Label>
                  <Input
                    id="er-interval_hours"
                    type="number"
                    placeholder="100"
                    min="0.1"
                    step="0.1"
                    value={form.interval_hours}
                    onChange={(e) => handleChange('interval_hours', e.target.value)}
                    className="bg-input border-border h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="er-interval_months" className="text-[11px] text-muted-foreground">Every (mo)</Label>
                  <Input
                    id="er-interval_months"
                    type="number"
                    placeholder="6"
                    min="1"
                    value={form.interval_months}
                    onChange={(e) => handleChange('interval_months', e.target.value)}
                    className="bg-input border-border h-8 text-xs"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="er-notify_miles" className="text-[11px] text-muted-foreground">Warn (mi early)</Label>
                  <Input
                    id="er-notify_miles"
                    type="number"
                    placeholder="500"
                    min="0"
                    value={form.notify_miles_before}
                    onChange={(e) => handleChange('notify_miles_before', e.target.value)}
                    className="bg-input border-border h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="er-notify_hours" className="text-[11px] text-muted-foreground">Warn (hrs early)</Label>
                  <Input
                    id="er-notify_hours"
                    type="number"
                    placeholder="10"
                    min="0"
                    step="0.5"
                    value={form.notify_hours_before}
                    onChange={(e) => handleChange('notify_hours_before', e.target.value)}
                    className="bg-input border-border h-8 text-xs"
                  />
                </div>
              </div>
            </div>
          </details>

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
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
              disabled={loading}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save Changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
