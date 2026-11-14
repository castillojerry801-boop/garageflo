'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Trash2, Loader2 } from 'lucide-react'

interface DeleteVehicleButtonProps {
  vehicleId: string
  vehicleName: string
}

export function DeleteVehicleButton({ vehicleId, vehicleName }: DeleteVehicleButtonProps) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    const { error } = await supabase.from('vehicles').delete().eq('id', vehicleId)
    if (error) {
      toast.error('Failed to delete vehicle')
      setLoading(false)
    } else {
      toast.success(`${vehicleName} removed from garage`)
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors">
        <Trash2 className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle>Remove Vehicle?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This will permanently delete <strong className="text-foreground">{vehicleName}</strong> and all its maintenance records, reminders, and attachments. This cannot be undone.
        </p>
        <div className="flex gap-3 mt-2">
          <Button
            variant="outline"
            className="flex-1 border-border hover:bg-secondary"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90 font-bold"
            onClick={handleDelete}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
