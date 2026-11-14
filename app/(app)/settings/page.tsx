export const instant = false

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ProfileForm } from '@/components/settings/profile-form'
import { SignOutButton } from '@/components/settings/sign-out-button'
import { User, Bell, Shield } from 'lucide-react'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-black">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account and preferences</p>
      </div>

      {/* Profile */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Profile
          </CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            email={user.email || ''}
            name={user.user_metadata?.full_name || ''}
          />
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Notifications
          </CardTitle>
          <CardDescription>How you get reminded about maintenance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground bg-secondary/50 rounded-xl p-4">
            <p className="font-medium text-foreground mb-1">Email Reminders</p>
            <p>GarageFlo sends you an email at <strong className="text-foreground">{user.email}</strong> when maintenance is due within 7 days or is overdue.</p>
            <p className="mt-2">More notification options coming soon.</p>
          </div>
        </CardContent>
      </Card>

      {/* Account */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <span className="text-foreground font-medium">Account ID:</span>{' '}
            <span className="font-mono text-xs">{user.id}</span>
          </div>
          <Separator className="bg-border" />
          <SignOutButton />
        </CardContent>
      </Card>
    </div>
  )
}
