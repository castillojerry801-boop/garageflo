import { createBrowserClient } from '@supabase/ssr'

const SUPABASE_URL = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  return url?.startsWith('http') ? url : 'https://placeholder.supabase.co'
})()

const SUPABASE_KEY = (() => {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return key && key !== 'your_supabase_anon_key' ? key : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder'
})()

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_KEY)
}
