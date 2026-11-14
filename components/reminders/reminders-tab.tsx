'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getReminderStatus, type Reminder } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Bell, AlertTriangle, Clock, CheckCircle, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface RemindersTabProps {
  reminders: Reminder[]
  currentMileage: number | null
  vehicleId: string
}

export function RemindersTab({ reminders, currentMileage, vehicleId }: RemindersTabProps) {
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
      <div className="text-center py-12 bg-card border border-dashed border-border rounded-2xl">
        <Bell className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
        <p className="text-muted-foreground font-medium">No reminders set</p>
        <p className="text-sm text-muted-foreground">Add a reminder to stay on top of maintenance</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {reminders.map((reminder) => {
        const status = getReminderStatus(reminder, currentMileage)
        const statusConfig = {
          overdue: { icon: AlertTriangle, label: 'Overdue', className: 'bg-danger/15 text-danger border-danger/30' },
          due_soon: { icon: Clock, label: 'Due Soon', className: 'bg-warning/15 text-warning border-warning/30' },
          ok: { icon: CheckCircle, label: 'Up to Date', className: 'bg-success/15 text-success border-success/30' },
        }
        const cfg = statusConfig[status]
        const StatusIcon = cfg.icon

        return (
          <div key={reminder.id} className={cn(
            'bg-card border rounded-xl p-4 flex items-start justify-between gap-4',
            status === 'overdue' ? 'border-danger/30' : status === 'due_soon' ? 'border-warning/30' : 'border-border'
          )}>
            <div className="flex items-start gap-3 min-w-0">
              <div className={cn('h-9 w-9 rounded-full flex items-center justify-center shrink-0',
                status === 'overdue' ? 'bg-danger/10' : status === 'due_soon' ? 'bg-warning/10' : 'bg-success/10'
              )}>
                <StatusIcon className={cn('h-4 w-4',
                  status === 'overdue' ? 'text-danger' : status === 'due_soon' ? 'text-warning' : 'text-success'
                )} />
              </div>
              <div className="min-w-0">
                <p className="font-semibold truncate">{reminder.service_type}</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {reminder.next_due_date && (
                    <span className="text-xs text-muted-foreground">
                      📅 {new Date(reminder.next_due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  )}
                  {reminder.next_due_mileage && (
                    <span className="text-xs text-muted-foreground">
                      🛣️ {reminder.next_due_mileage.toLocaleString()} mi
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge className={cn('text-xs font-semibold border', cfg.className)}>
                {cfg.label}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-danger hover:bg-danger/10"
                onClick={() => handleDelete(reminder.id)}
                disabled={deletingId === reminder.id}
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
