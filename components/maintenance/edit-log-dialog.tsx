'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { type MaintenanceLog } from '@/types'
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
import { Pencil, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

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

interface EditLogDialogProps {
  log: MaintenanceLog
}

function formFromLog(log: MaintenanceLog) {
  const inQuick = QUICK_SERVICES.includes(log.service_type)
  return {
    service_type: inQuick ? log.service_type : 'Other',
    custom_service: inQuick ? '' : log.service_type,
    performed_at: log.performed_at,
    mileage_at_service: log.mileage_at_service?.toString() ?? '',
    cost: log.cost?.toString() ?? '',
    notes: log.notes ?? '',
  }
}

export function EditLogDialog({ log }: EditLogDialogProps) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(() => formFromLog(log))

  function handleOpenChange(val: boolean) {
    if (!val) setForm(formFromLog(log))
    setOpen(val)
  }

  function handleChange(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
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

    const { error } = await supabase
      .from('maintenance_logs')
      .update({
        service_type: serviceType,
        performed_at: form.performed_at,
        mileage_at_service: form.mileage_at_service ? parseInt(form.mileage_at_service) : null,
        cost: form.cost ? parseFloat(form.cost) : null,
        notes: form.notes.trim() || null,
      })
      .eq('id', log.id)

    setLoading(false)
    if (error) {
      toast.error('Failed to update service record')
    } else {
      toast.success('Service record updated!')
      setOpen(false)
      router.refresh()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        className="inline-flex items-center justify-center h-7 w-7 rounded text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors"
        aria-label="Edit service record"
      >
        <Pencil className="h-3.5 w-3.5" />
      </DialogTrigger>

      <DialogContent className="bg-card border-border max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Edit Service Record</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-1">
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

          <div className="space-y-1.5">
            <Label htmlFor="el-performed_at" className="text-sm font-semibold">Date Performed</Label>
            <Input
              id="el-performed_at"
              type="date"
              value={form.performed_at}
              onChange={(e) => handleChange('performed_at', e.target.value)}
              className="bg-input border-border"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="el-mileage" className="text-xs text-muted-foreground">Mileage</Label>
              <Input
                id="el-mileage"
                type="number"
                placeholder="45,000"
                min="0"
                value={form.mileage_at_service}
                onChange={(e) => handleChange('mileage_at_service', e.target.value)}
                className="bg-input border-border"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="el-cost" className="text-xs text-muted-foreground">Cost ($)</Label>
              <Input
                id="el-cost"
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
            <Label htmlFor="el-notes" className="text-xs text-muted-foreground">Notes</Label>
            <Textarea
              id="el-notes"
              placeholder="Parts replaced, shop name, observations..."
              value={form.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={3}
              className="bg-input border-border resize-none text-sm"
            />
          </div>

          <div className="flex gap-3 pt-1">
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
