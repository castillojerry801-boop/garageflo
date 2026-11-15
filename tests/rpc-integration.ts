/**
 * Integration tests for the reorder_vehicles RPC.
 *
 * Run after applying lib/supabase/migration-m5.sql:
 *   npx tsx --env-file=.env.local tests/rpc-integration.ts
 *
 * Uses an isolated test user (created + deleted by this script).
 * Never touches real user records.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('Missing required env vars. Use --env-file=.env.local')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ─── State ────────────────────────────────────────────────────────────────────

const TEST_EMAIL = `test-m5-rpc-${randomUUID()}@test.garageflo.internal`
const TEST_PASSWORD = `Aa1!${randomUUID()}`
let testUserId = ''
let testGarageId = ''
let userClient!: SupabaseClient

// ─── Reporting ────────────────────────────────────────────────────────────────

let pass = 0
let fail = 0

function ok(label: string, value: boolean, detail?: string) {
  if (value) {
    console.log(`  ✅ ${label}`)
    pass++
  } else {
    console.error(`  ❌ ${label}${detail ? ': ' + detail : ''}`)
    fail++
  }
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

async function preflight() {
  // Verify the migration has been applied before running any tests
  const { error } = await admin.from('vehicles').select('sort_order').limit(0)
  if (error?.code === '42703') {
    console.error('\n⛔ Migration not applied: sort_order column missing.')
    console.error('   Run lib/supabase/migration-m5.sql in the Supabase SQL editor first.')
    process.exit(1)
  }

  // Verify the reorder_vehicles function exists
  const { error: rpcErr } = await admin.rpc('reorder_vehicles', { p_section_ids: [] })
  if (rpcErr?.code === 'PGRST202') {
    console.error('\n⛔ Migration not applied: reorder_vehicles function missing.')
    console.error('   Run lib/supabase/migration-m5.sql in the Supabase SQL editor first.')
    process.exit(1)
  }
  console.log('  ✅ Preflight: sort_order column present')
  console.log('  ✅ Preflight: reorder_vehicles function present')
}

async function setup() {
  const { data, error } = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  if (error) throw new Error(`createUser: ${error.message}`)
  testUserId = data.user!.id

  // The on_auth_user_created trigger creates a garage row
  const { data: garage, error: garageErr } = await admin
    .from('garages')
    .select('id')
    .eq('user_id', testUserId)
    .single()
  if (garageErr) throw new Error(`Garage not found: ${garageErr.message}`)
  testGarageId = garage.id

  // Sign in as the test user to get a real JWT for PostgREST RPC calls
  userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error: signInErr } = await userClient.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  })
  if (signInErr) throw new Error(`signIn: ${signInErr.message}`)
}

async function teardown() {
  if (testUserId) {
    // Deleting the auth user cascades to garages → vehicles and all child rows
    await admin.auth.admin.deleteUser(testUserId)
    console.log('  🧹 Test user and all test data deleted')
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createVehicle(
  type: string,
  name: string,
  sortOrder: number | null = null,
): Promise<string> {
  const { data, error } = await admin
    .from('vehicles')
    .insert({
      user_id: testUserId,
      garage_id: testGarageId,
      type,
      name,
      tracking_method: 'mileage',
      sort_order: sortOrder,
    })
    .select('id')
    .single()
  if (error) throw new Error(`createVehicle(${name}): ${error.message}`)
  return data.id as string
}

async function getVehicles(ids: string[]) {
  const { data } = await admin
    .from('vehicles')
    .select('id, sort_order')
    .in('id', ids)
    .order('sort_order', { ascending: true, nullsFirst: false })
  return data ?? []
}

async function cleanup(...ids: string[]) {
  await admin.from('vehicles').delete().in('id', ids)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function testSuccessfulReorder() {
  console.log('\n📋 Test: Successful vehicles section reorder')
  const car1 = await createVehicle('car', 'Car One', 1)
  const car2 = await createVehicle('car', 'Car Two', 2)
  const car3 = await createVehicle('car', 'Car Three', 3)

  // Reorder: [3, 1, 2]
  const { error } = await userClient.rpc('reorder_vehicles', {
    p_section_ids: [car3, car1, car2],
  })
  ok('RPC returns no error', !error, error?.message)

  const vehicles = await getVehicles([car1, car2, car3])
  ok('car3 is position 1', vehicles[0]?.id === car3)
  ok('car1 is position 2', vehicles[1]?.id === car1)
  ok('car2 is position 3', vehicles[2]?.id === car2)
  ok('All positions are numeric', vehicles.every((v) => typeof v.sort_order === 'number'))

  await cleanup(car1, car2, car3)
}

async function testEquipmentSection() {
  console.log('\n📋 Test: Equipment section reorder')
  const gen = await createVehicle('generator', 'Generator', 1)
  const trailer = await createVehicle('trailer', 'Trailer', 2)
  const atv = await createVehicle('atv', 'ATV', 3)

  const { error } = await userClient.rpc('reorder_vehicles', {
    p_section_ids: [atv, trailer, gen],
  })
  ok('Equipment section RPC returns no error', !error, error?.message)

  const vehicles = await getVehicles([gen, trailer, atv])
  ok('atv is position 1', vehicles[0]?.id === atv)
  ok('trailer is position 2', vehicles[1]?.id === trailer)
  ok('gen is position 3', vehicles[2]?.id === gen)

  await cleanup(gen, trailer, atv)
}

async function testOwnershipRejection() {
  console.log('\n📋 Test: Ownership — foreign vehicle rejected (guard 2)')

  // Create a second user and their vehicle
  const otherEmail = `test-m5-other-${randomUUID()}@test.garageflo.internal`
  const { data: otherUserData } = await admin.auth.admin.createUser({
    email: otherEmail,
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  const otherUserId = otherUserData!.user!.id
  const { data: otherGarage } = await admin
    .from('garages')
    .select('id')
    .eq('user_id', otherUserId)
    .single()
  const { data: otherVehicle } = await admin
    .from('vehicles')
    .insert({
      user_id: otherUserId,
      garage_id: otherGarage!.id,
      type: 'car',
      name: 'OtherCar',
      tracking_method: 'mileage',
      sort_order: 1,
    })
    .select('id')
    .single()

  const myVehicle = await createVehicle('car', 'MyCar', 1)

  // userClient tries to include the other user's vehicle
  const { error } = await userClient.rpc('reorder_vehicles', {
    p_section_ids: [myVehicle, otherVehicle!.id],
  })
  ok('Rejects foreign vehicle ID', !!error, 'expected error, got none')
  ok('Error code is P0001', error?.code === 'P0001', error?.code)

  await cleanup(myVehicle)
  await admin.auth.admin.deleteUser(otherUserId)
}

async function testDuplicateIds() {
  console.log('\n📋 Test: Duplicate IDs rejected (guard 1)')
  const car1 = await createVehicle('car', 'DupCar1', 1)
  const car2 = await createVehicle('car', 'DupCar2', 2)

  const { error } = await userClient.rpc('reorder_vehicles', {
    p_section_ids: [car1, car2, car1], // car1 duplicated
  })
  ok('Rejects duplicate IDs', !!error)
  ok('Error code is P0001', error?.code === 'P0001', error?.code)

  await cleanup(car1, car2)
}

async function testMixedSections() {
  console.log('\n📋 Test: Mixed sections rejected (guard 3)')
  const car = await createVehicle('car', 'MixCar', 1)
  const gen = await createVehicle('generator', 'MixGen', 1)

  const { error } = await userClient.rpc('reorder_vehicles', {
    p_section_ids: [car, gen],
  })
  ok('Rejects mixed sections', !!error)
  ok('Error code is P0001', error?.code === 'P0001', error?.code)

  await cleanup(car, gen)
}

async function testIncompleteSection() {
  console.log('\n📋 Test: Incomplete section rejected (guard 4)')
  const car1 = await createVehicle('car', 'Inc1', 1)
  const car2 = await createVehicle('car', 'Inc2', 2)
  const car3 = await createVehicle('car', 'Inc3', 3) // exists but NOT in submission

  const { error } = await userClient.rpc('reorder_vehicles', {
    p_section_ids: [car1, car2], // missing car3
  })
  ok('Rejects incomplete section', !!error)
  ok('Error code is P0001', error?.code === 'P0001', error?.code)

  await cleanup(car1, car2, car3)
}

async function testRollbackOnFailure() {
  console.log('\n📋 Test: Failed RPC leaves positions unchanged')
  const car1 = await createVehicle('car', 'Roll1', 1)
  const car2 = await createVehicle('car', 'Roll2', 2)

  // This will fail (guard 4: incomplete section — 2 cars exist, submitting only 1)
  const { error: failErr } = await userClient.rpc('reorder_vehicles', {
    p_section_ids: [car2],
  })
  ok('Failed RPC returned an error', !!failErr)

  const vehicles = await getVehicles([car1, car2])
  ok('car1 retains sort_order 1 after failed RPC', vehicles[0]?.sort_order === 1)
  ok('car2 retains sort_order 2 after failed RPC', vehicles[1]?.sort_order === 2)

  await cleanup(car1, car2)
}

async function testPermissions() {
  console.log('\n📋 Test: Permissions')

  // Empty array → early RETURN (not an error) when called by a user
  const myVehicle = await createVehicle('car', 'PermCar', 1)
  const { error: emptyErr } = await userClient.rpc('reorder_vehicles', {
    p_section_ids: [],
  })
  // Empty array guard: v_array_len is null → RETURN (no error)
  ok('Authenticated user: empty array returns cleanly', !emptyErr, emptyErr?.message)
  await cleanup(myVehicle)

  // Anon (unauthenticated) client should be rejected
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error: anonErr } = await anonClient.rpc('reorder_vehicles', {
    p_section_ids: [],
  })
  // Should get PGRST202 (no EXECUTE permission) or P0001 (unauthenticated exception)
  ok('Anon client is rejected', !!anonErr, 'expected error, got none')
  // 42501 = PostgreSQL insufficient_privilege (REVOKE EXECUTE in effect — best outcome)
  // PGRST202 = PostgREST function-not-found (anon has no EXECUTE)
  // P0001 = our unauthenticated exception (function ran but no auth.uid())
  ok(
    'Anon error is permission or auth failure',
    anonErr?.code === '42501' || anonErr?.code === 'PGRST202' || anonErr?.code === 'P0001',
    anonErr?.code,
  )
}

async function testNullsLastOrdering() {
  console.log('\n📋 Test: New items (null sort_order) appear last')
  const car1 = await createVehicle('car', 'Ordered1', 1)
  const car2 = await createVehicle('car', 'Ordered2', 2)
  const newCar = await createVehicle('car', 'NewCar', null) // null — no sort order

  // Dashboard query order: sort_order ASC NULLS LAST, then created_at DESC
  const { data: allCars } = await admin
    .from('vehicles')
    .select('id, sort_order')
    .in('id', [car1, car2, newCar])
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  ok('Null sort_order item appears last', allCars?.[allCars.length - 1]?.id === newCar)
  ok('car1 appears first', allCars?.[0]?.id === car1)
  ok('car2 appears second', allCars?.[1]?.id === car2)
  ok('New item has null sort_order', allCars?.[allCars.length - 1]?.sort_order === null)

  await cleanup(car1, car2, newCar)
}

async function testIdempotentReorder() {
  console.log('\n📋 Test: Reorder is idempotent (applying same order twice)')
  const car1 = await createVehicle('car', 'Idem1', null)
  const car2 = await createVehicle('car', 'Idem2', null)

  // First reorder: [car2, car1]
  const { error: err1 } = await userClient.rpc('reorder_vehicles', {
    p_section_ids: [car2, car1],
  })
  ok('First reorder succeeds', !err1, err1?.message)

  // Apply same order again
  const { error: err2 } = await userClient.rpc('reorder_vehicles', {
    p_section_ids: [car2, car1],
  })
  ok('Identical reorder is idempotent (no error)', !err2, err2?.message)

  const vehicles = await getVehicles([car1, car2])
  ok('car2 is position 1 after idempotent reorder', vehicles[0]?.id === car2)
  ok('car1 is position 2 after idempotent reorder', vehicles[1]?.id === car1)

  await cleanup(car1, car2)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔬 GarageFlo Integration Tests — reorder_vehicles RPC\n')
  console.log(`   Target:     ${SUPABASE_URL}`)
  console.log(`   Test user:  ${TEST_EMAIL}\n`)

  console.log('⚙️  Preflight checks...')
  await preflight()

  console.log('\n⚙️  Setting up isolated test user...')
  await setup()
  console.log(`   User ID:    ${testUserId}`)
  console.log(`   Garage ID:  ${testGarageId}`)

  try {
    await testSuccessfulReorder()
    await testEquipmentSection()
    await testOwnershipRejection()
    await testDuplicateIds()
    await testMixedSections()
    await testIncompleteSection()
    await testRollbackOnFailure()
    await testPermissions()
    await testNullsLastOrdering()
    await testIdempotentReorder()
  } finally {
    console.log('\n⚙️  Cleaning up...')
    await teardown()
  }

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`Results: ${pass} passed, ${fail} failed`)

  if (fail > 0) {
    console.error('\n❌ Integration tests FAILED')
    process.exit(1)
  } else {
    console.log('\n✅ All integration tests passed')
  }
}

main().catch((err) => {
  console.error('\nFatal:', err.message)
  process.exit(1)
})
