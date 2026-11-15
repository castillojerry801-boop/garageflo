'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getReminderStatus, type Reminder, type ReminderStatus } from '@/types'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Clock, CheckCircle, Trash2, Calendar, Gauge, Timer } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { EditReminderDialog } from '@/components/reminders/edit-reminder-dialog'

interface RemindersTabProps {
  reminders: Reminder[]
  currentMileage: number | null
  currentHours?: number | null
  vehicleId: string
}

export function RemindersTab({ reminders, currentMileage, currentHours }: RemindersTabProps) {
  const router = useRouter()
  const supabase = createClient()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleDelete(id: string) {
    setDeletingId(id)
    const { error } = await supabase.from('reminders').delete().eq('id', id)
    if (error) {
      toast.error('Failed to delete reminder')
    } else {
      toast.success('Reminder removed')
      router.refresh()
    }
    setDeletingId(null)
  }

  if (reminders.length === 0) {
    return (
      <div className="text-center py-12 border border-dashed border-border/50 rounded-xl">
        <p className="text-sm font-medium text-muted-foreground">No reminders set</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Add a reminder to stay on top of maintenance</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {reminders.map((reminder) => {
        const status = getReminderStatus(reminder, currentMileage, currentHours)
        const configs: Record<ReminderStatus, { Icon: React.ElementType; label: string; border: string; iconCls: string; badge: string }> = {
          overdue:    { Icon: AlertTriangle, label: 'Overdue',    border: 'border-danger/35',  iconCls: 'text-danger',     badge: 'bg-danger/10 text-danger border-danger/30' },
          due:        { Icon: AlertTriangle, label: 'Due Now',    border: 'border-danger/35',  iconCls: 'text-danger',     badge: 'bg-danger/10 text-danger border-danger/30' },
          approaching:{ Icon: Clock,         label: 'Approaching',border: 'border-warning/30', iconCls: 'text-warning',    badge: 'bg-warning/10 text-warning border-warning/30' },
          ok:         { Icon: CheckCircle,   label: 'Up to Date', border: 'border-border/60',  iconCls: 'text-success/70', badge: 'bg-success/10 text-success border-success/25' },
        }
        const cfg = configs[status]

        return (
          <div
            key={reminder.id}
            className={cn('bg-card border rounded-xl px-4 py-3.5 flex items-start justify-between gap-4', cfg.border)}
          >
            <div className="flex items-start gap-3 min-w-0">
              <cfg.Icon className={cn('h-4 w-4 shrink-0 mt-0.5', cfg.iconCls)} />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{reminder.service_type}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                  {reminder.next_due_date && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {new Date(reminder.next_due_date).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </span>
                  )}
                  {reminder.next_due_mileage != null && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Gauge className="h-3 w-3" />
                      {reminder.next_due_mileage.toLocaleString()} mi
                    </span>
                  )}
                  {reminder.next_due_hours != null && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Timer className="h-3 w-3" />
                      {reminder.next_due_hours.toLocaleString()} hrs
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded border', cfg.badge)}>
                {cfg.label}
              </span>
              <EditReminderDialog reminder={reminder} />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground/50 hover:text-danger hover:bg-danger/10"
                onClick={() => handleDelete(reminder.id)}
                disabled={deletingId === reminder.id}
                aria-label="Delete reminder"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
