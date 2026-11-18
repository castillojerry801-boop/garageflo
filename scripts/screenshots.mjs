/**
 * Screenshot capture script for GarageFlo UI review.
 * Usage:
 *   SCREENSHOT_EMAIL=you@example.com SCREENSHOT_PASSWORD=yourpassword node scripts/screenshots.mjs
 */
import { chromium } from 'playwright'
import { createRequire } from 'module'
import path from 'path'
import os from 'os'

const BASE = 'http://localhost:3456'
const OUT = '/private/tmp/claude-501/-Users-jerrycastillo-Projects-garageflo/73594d62-e697-474a-9683-2e2fda10732e/scratchpad'
const CHROMIUM_EXE = path.join(
  os.homedir(),
  'Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
)
const MOBILE = { width: 390, height: 844 }

async function run() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROMIUM_EXE,
  })

  const ctx = await browser.newContext({
    ...MOBILE,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
  })
  const page = await ctx.newPage()

  async function shot(name) {
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false })
    console.log(`✓ ${name}`)
  }

  // ── Unauthenticated pages ──────────────────────────────────────
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await shot('login_mobile')

  await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' })
  await shot('signup_mobile')

  // ── Authenticate ───────────────────────────────────────────────
  const email = process.env.SCREENSHOT_EMAIL
  const password = process.env.SCREENSHOT_PASSWORD

  if (!email || !password) {
    console.log('\n⚠  Set SCREENSHOT_EMAIL and SCREENSHOT_PASSWORD to capture authenticated pages.')
    console.log('   Example: SCREENSHOT_EMAIL=you@example.com SCREENSHOT_PASSWORD=pass node scripts/screenshots.mjs\n')
    await browser.close()
    return
  }

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', password)
  await page.click('button[type=submit]')

  try {
    await page.waitForURL(`${BASE}/dashboard`, { timeout: 15000 })
  } catch {
    console.error('Login failed or timed out. Check credentials.')
    await browser.close()
    process.exit(1)
  }

  await page.waitForLoadState('networkidle')
  await shot('dashboard_mobile')

  // ── Scroll down to see the garage grid ────────────────────────
  await page.evaluate(() => window.scrollBy(0, 300))
  await page.waitForTimeout(400)
  await shot('dashboard_grid_mobile')

  // ── Vehicle detail ─────────────────────────────────────────────
  const vehicleLinks = await page.$$('a[href^="/garage/"]')
  if (vehicleLinks.length > 0) {
    const href = await vehicleLinks[0].getAttribute('href')
    await page.goto(`${BASE}${href}`, { waitUntil: 'networkidle' })
    await shot('vehicle_hero_mobile')

    // Scroll to show stats + history tab
    await page.evaluate(() => window.scrollBy(0, 400))
    await page.waitForTimeout(400)
    await shot('vehicle_history_mobile')

    // Click Reminders tab
    await page.goto(`${BASE}${href}`, { waitUntil: 'networkidle' })
    const remindersTab = page.locator('[role=tab]', { hasText: 'Reminders' })
    if (await remindersTab.count() > 0) {
      await remindersTab.click()
      await page.waitForTimeout(600)
      await shot('reminders_mobile')
    }
  }

  await browser.close()
  console.log('\nAll screenshots saved to:', OUT)
}

run().catch(e => { console.error('Error:', e.message); process.exit(1) })
