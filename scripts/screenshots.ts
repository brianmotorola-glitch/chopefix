/**
 * Captures real rendered screenshots of a running ChopeFix server.
 * Usage: BASE_URL=http://localhost:3000 npm run screenshots
 * Needs Chrome/Chromium (CHROME_PATH, default /usr/bin/google-chrome) and playwright-core.
 */
import { chromium, type Page } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = path.resolve(import.meta.dirname, '..', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

async function demo(page: Page, email: string) {
  await page.evaluate(async (e) => { await fetch('/api/auth/demo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: e }) }); }, email);
  await page.reload({ waitUntil: 'networkidle' });
}
async function shot(page: Page, name: string, fullPage = false) {
  await page.waitForTimeout(450);
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage });
  console.log(`saved ${file}`);
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, timezoneId: 'Asia/Singapore', locale: 'en-SG' });
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: 'networkidle' });

// 1) Customer catalog
await demo(page, 'rachel@chopefix.demo');
await page.getByText('Book a fix').first().click();
await shot(page, 'customer-catalog.png');

// 2) Booking drawer
await page.getByRole('button', { name: 'Chope it' }).first().click();
await page.getByPlaceholder('520231').fill('520231');
await page.getByPlaceholder('#08-112').fill('#08-112');
await shot(page, 'booking-drawer.png');
await page.keyboard.press('Escape');

// 3) Job tracker with warranty (completed seed booking)
await page.getByRole('button', { name: /My bookings/ }).click();
await page.getByRole('button', { name: /Leaking tap \/ mixer repair/ }).first().click();
await page.waitForTimeout(300);
await shot(page, 'job-tracker-warranty.png');
await page.getByRole('button', { name: 'Warranty certificate' }).click();
await shot(page, 'warranty-certificate.png');
await page.mouse.click(10, 10);

// 4) Customer pending add-on approval (in-progress electrical booking)
await page.getByRole('button', { name: /13A power socket replacement/ }).first().click();
await shot(page, 'customer-addon-approval.png');

// 5) Contractor portal (EMA LEW with active job)
await demo(page, 'farid@chopefix.demo');
await shot(page, 'contractor-portal.png');

// 6) Contractor feed (handyman sees open TV-mount job with net payout)
await demo(page, 'jason@chopefix.demo');
await page.getByRole('button', { name: /Available jobs/ }).click();
await shot(page, 'contractor-feed.png');

// 7) Ops dashboard
await demo(page, 'ops@chopefix.demo');
await shot(page, 'ops-dashboard.png');

// 8) Mobile customer view
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'Asia/Singapore' });
const mp = await m.newPage();
await mp.goto(BASE, { waitUntil: 'networkidle' });
await demo(mp, 'rachel@chopefix.demo');
await shot(mp, 'mobile-customer.png');

// restore default demo role for anyone opening the app next
await demo(page, 'rachel@chopefix.demo');
await browser.close();
