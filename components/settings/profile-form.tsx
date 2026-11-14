'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

interface ProfileFormProps {
  email: string
  name: string
}

export function ProfileForm({ email, name: initialName }: ProfileFormProps) {
  const supabase = createClient()
  const [name, setName] = useState(initialName)
  const [loading, setLoading] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ data: { full_name: name } })
    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Profile updated')
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Display Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bg-input border-border"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          value={email}
          disabled
          className="bg-input border-border opacity-60"
        />
        <p className="text-xs text-muted-foreground">Email cannot be changed here</p>
      </div>
      <Button
        type="submit"
        className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
        disabled={loading}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Save Changes
      </Button>
    </form>
  )
}
