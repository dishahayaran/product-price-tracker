/**
 * Flipkart price scraper using Playwright.
 *
 * Strategy:
 *  1. Launch a headless Chromium browser.
 *  2. Set realistic browser headers + locale to mimic a real Indian user.
 *  3. Set the delivery pincode by interacting with Flipkart's pincode widget.
 *  4. Wait for the price element to appear (JS-rendered page).
 *  5. Extract and parse the price.
 *
 * Multiple CSS selectors are tried in order, from most specific to least,
 * so the scraper degrades gracefully if Flipkart changes its DOM.
 */

import { chromium, Browser, Page } from "playwright";
import { Product, ScrapeResult } from "./types";
import { logger } from "./logger";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 8_000; // wait between retries
const PAGE_TIMEOUT_MS = 60_000; // 60 s for full page load
const ELEMENT_TIMEOUT_MS = 20_000; // 20 s to wait for price element

/**
 * Flipkart price CSS selectors, tried in order.
 * Flipkart uses multiple patterns depending on product type.
 */
const PRICE_SELECTORS = [
  // Standard product page — primary price
  'div[class*="Nx9bqj"]',         // 2024+ class
  'div._30jeq3._16Jk6d',          // older class
  'div._30jeq3',                   // fallback
  // Deal / special offer pages
  'div[class*="pPAw9M"]',
  // Generic price containers
  'span[class*="Sq6uoQ"]',
  '._3I9_wc._2p6lqe',
  // Very generic fallback — any element whose text starts with ₹
  'text=/^₹[\\d,]+/',
];

/** User agents rotated to reduce fingerprinting */
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
];

function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Price Parser ─────────────────────────────────────────────────────────────

/**
 * Convert "₹1,09,999" → 109999
 * Returns null if the string can't be parsed as a price.
 */
export function parsePrice(raw: string): number | null {
  const cleaned = raw.replace(/[₹,\s]/g, "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) || num <= 0 ? null : num;
}

// ─── Pincode Setter ───────────────────────────────────────────────────────────

/**
 * Attempt to set the delivery pincode on the product page.
 * This is best-effort: if the widget is absent, we continue without it
 * (the page will show the default city price, which is usually correct).
 */
async function setPincode(page: Page, pincode: string): Promise<void> {
  try {
    // Look for the pincode input on the page
    const pincodeSelectors = [
      'input[class*="_3wVMW4"]',  // 2024
      'input[placeholder*="Enter Delivery Pincode"]',
      'input[placeholder*="pincode"]',
      'input[id*="pincode"]',
    ];

    let inputFound = false;
    for (const sel of pincodeSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await el.click();
        await el.fill("");
        await el.type(pincode, { delay: 80 });
        // Submit via button or Enter
        const checkBtn = page.locator('button:has-text("Check"), button:has-text("Deliver")').first();
        if (await checkBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await checkBtn.click();
        } else {
          await el.press("Enter");
        }
        await sleep(2_000); // wait for price to refresh
        inputFound = true;
        logger.debug(`Pincode ${pincode} set successfully.`);
        break;
      }
    }

    if (!inputFound) {
      logger.debug("Pincode widget not found — using default price.");
    }
  } catch (err) {
    // Non-fatal; log and continue
    logger.debug("Could not set pincode", { error: (err as Error).message });
  }
}

// ─── Price Extractor ──────────────────────────────────────────────────────────

async function extractPrice(page: Page): Promise<number | null> {
  for (const selector of PRICE_SELECTORS) {
    try {
      const el = page.locator(selector).first();
      const visible = await el.isVisible({ timeout: ELEMENT_TIMEOUT_MS }).catch(() => false);
      if (!visible) continue;

      const text = (await el.textContent()) ?? "";
      const price = parsePrice(text);
      if (price !== null) {
        logger.debug(`Price found via selector "${selector}"`, { rawText: text, price });
        return price;
      }
    } catch {
      // Try next selector
    }
  }
  return null;
}

// ─── Product Name Extractor ───────────────────────────────────────────────────

async function extractProductName(page: Page): Promise<string | null> {
  const nameSelectors = [
    'span.B_NuCI',       // standard product title
    'h1.yhB1nd',         // newer layout
    'h1[class*="yhB1nd"]',
    'span[class*="B_NuCI"]',
  ];

  for (const selector of nameSelectors) {
    try {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout: 5_000 }).catch(() => false)) {
        const text = (await el.textContent())?.trim();
        if (text) return text;
      }
    } catch {
      // Try next
    }
  }

  // Fallback: use the page title (strip " - Buy ... | Flipkart.com")
  const title = await page.title();
  return title.split(" - Buy ")[0].trim() || null;
}

// ─── Core Scrape Function ─────────────────────────────────────────────────────

/**
 * Scrape a single Flipkart product page.
 * Retries up to MAX_RETRIES times on failure.
 */
export async function scrapeProduct(product: Product): Promise<ScrapeResult> {
  let browser: Browser | null = null;
  let lastError = "Unknown error";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.info(`Scraping "${product.name}" (attempt ${attempt}/${MAX_RETRIES})`, {
        url: product.url,
      });

      browser = await chromium.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--disable-gpu",
          "--window-size=1366,768",
        ],
      });

      const context = await browser.newContext({
        userAgent: randomUserAgent(),
        viewport: { width: 1366, height: 768 },
        locale: "en-IN",
        timezoneId: "Asia/Kolkata",
        extraHTTPHeaders: {
          "Accept-Language": "en-IN,en;q=0.9",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          "Upgrade-Insecure-Requests": "1",
        },
      });

      // Block images, fonts, and ads to speed up the scrape
      await context.route(
        "**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf,eot,ico}",
        (route) => route.abort()
      );
      await context.route("**/{ads,analytics,doubleclick}**", (route) =>
        route.abort()
      );

      const page = await context.newPage();
      page.setDefaultTimeout(PAGE_TIMEOUT_MS);

      await page.goto(product.url, {
        waitUntil: "domcontentloaded",
        timeout: PAGE_TIMEOUT_MS,
      });

      // Brief pause to let React hydrate
      await sleep(2_000);

      // Set pincode for localised pricing
      await setPincode(page, product.pincode);

      // Extract price and name
      const price = await extractPrice(page);
      const productName = await extractProductName(page);

      await browser.close();
      browser = null;

      if (price === null) {
        throw new Error(
          "Could not find a price on the page. The page layout may have changed."
        );
      }

      logger.info(`✓ Price extracted: ₹${price.toLocaleString("en-IN")}`, {
        product: product.name,
      });

      return { success: true, price, productName };
    } catch (err) {
      lastError = (err as Error).message;
      logger.warn(`Attempt ${attempt} failed for "${product.name}"`, {
        error: lastError,
      });

      if (browser) {
        await browser.close().catch(() => {});
        browser = null;
      }

      if (attempt < MAX_RETRIES) {
        logger.info(`Waiting ${RETRY_DELAY_MS / 1000}s before retry…`);
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  return { success: false, price: null, productName: null, error: lastError };
}

// ─── CLI Test Entry Point ─────────────────────────────────────────────────────

if (process.argv.includes("--test")) {
  (async () => {
    const testProduct: Product = {
      id: "test",
      name: "Test Product",
      url:
        process.env.TEST_URL ||
        "https://www.flipkart.com/apple-iphone-16-black-128-gb/p/itm6e3dcf1bf5f8b",
      pincode: "462001",
      active: true,
    };

    console.log("Running scraper test…");
    const result = await scrapeProduct(testProduct);
    console.log("Result:", JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  })();
}
