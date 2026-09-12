import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE = process.env.ZABUTON_URL || 'https://original-spoonbill-489.convex.site'
const OUT = path.join(__dirname, 'out')
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
const page = await context.newPage()
await page.goto(`${BASE}/clerk`)
await page.getByRole('button', { name: 'Open the demo clerk desk' }).click()
await page.waitForSelector('.rail-city', { timeout: 30000 })
await page.waitForTimeout(1500)
await context.storageState({ path: path.join(OUT, 'state.json') })
console.log('session saved to out/state.json')
await browser.close()
