import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { formatDateOnly } from '@/lib/utils'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY.startsWith('your_')) {
    return NextResponse.json({ sent: 0, note: 'Email not configured' })
  }
  const resend = new Resend(process.env.RESEND_API_KEY)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const supabase = createServerClient(supabaseUrl, serviceRoleKey, {
    cookies: { getAll: () => [], setAll: () => {} },
  })

  const today = new Date()
  const in7Days = new Date(today)
  in7Days.setDate(in7Days.getDate() + 7)
  const todayStr = today.toISOString().split('T')[0]
  const in7DaysStr = in7Days.toISOString().split('T')[0]

  const { data: reminders } = await supabase
    .from('reminders')
    .select(`
      *,
      vehicles (
        id, name, year, make, model, mileage, user_id,
        garages (user_id)
      )
    `)
    .eq('is_active', true)
    .lte('next_due_date', in7DaysStr)

  if (!reminders || reminders.length === 0) {
    return NextResponse.json({ sent: 0 })
  }

  const userReminders: Record<string, { email: string; reminders: typeof reminders }> = {}

  for (const reminder of reminders) {
    const vehicle = reminder.vehicles as { user_id: string; id: string; name: string; year: number; make: string; model: string; mileage: number }
    if (!vehicle) continue

    const { data: authUser } = await supabase.auth.admin.getUserById(vehicle.user_id)
    if (!authUser?.user?.email) continue

    const email = authUser.user.email
    if (!userReminders[email]) {
      userReminders[email] = { email, reminders: [] }
    }
    userReminders[email].reminders.push(reminder)
  }

  let sent = 0
  for (const { email, reminders: userRems } of Object.values(userReminders)) {
    const reminderList = userRems.map((r) => {
      const v = r.vehicles as { name: string; year: number; make: string; model: string }
      const vehicleName = [v?.year, v?.make, v?.model].filter(Boolean).join(' ') || v?.name
      const dueStr = r.next_due_date
        ? `by ${formatDateOnly(r.next_due_date, { month: 'long', day: 'numeric', year: 'numeric' })}`
        : r.next_due_mileage
        ? `at ${r.next_due_mileage.toLocaleString()} miles`
        : ''
      const isOverdue = r.next_due_date && r.next_due_date < todayStr
      return `<li style="margin-bottom: 8px;"><strong>${r.service_type}</strong> — ${vehicleName} ${dueStr}${isOverdue ? ' <span style="color:#ef4444;">(OVERDUE)</span>' : ''}</li>`
    }).join('')

    await resend.emails.send({
      from: 'GarageFlo <reminders@garageflo.com>',
      to: email,
      subject: `🔧 You have ${userRems.length} maintenance reminder${userRems.length !== 1 ? 's' : ''} due`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1d2e; color: #f8f9fa; padding: 32px; border-radius: 16px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="font-size: 28px; font-weight: 900; margin: 0;">
              <span style="color: #f8f9fa;">Garage</span><span style="color: #00aeef;">Flo</span>
            </h1>
          </div>
          <h2 style="font-size: 20px; margin-bottom: 16px;">Maintenance Reminders</h2>
          <ul style="padding-left: 20px; color: #f8f9fa;">
            ${reminderList}
          </ul>
          <div style="margin-top: 32px; text-align: center;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="background: #00aeef; color: #0a0c14; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
              View My Garage
            </a>
          </div>
        </div>
      `,
    })
    sent++
  }

  return NextResponse.json({ sent })
}
