import fs from "fs";
import path from "path";
import { ProductsFile, PricesFile, PriceRecord } from "./types";

// ─── Paths ────────────────────────────────────────────────────────────────────

const DATA_DIR = path.resolve(process.cwd(), "data");
const PRODUCTS_PATH = path.join(DATA_DIR, "products.json");
const PRICES_PATH = path.join(DATA_DIR, "prices.json");

// ─── Products ─────────────────────────────────────────────────────────────────

/**
 * Read and parse products.json.
 * Throws a clear error if the file is missing or malformed.
 */
export function readProducts(): ProductsFile {
  if (!fs.existsSync(PRODUCTS_PATH)) {
    throw new Error(
      `products.json not found at ${PRODUCTS_PATH}.\n` +
        `Create it using data/products.json as a template.`
    );
  }

  const raw = fs.readFileSync(PRODUCTS_PATH, "utf-8");

  try {
    const parsed = JSON.parse(raw) as ProductsFile;
    if (!Array.isArray(parsed.products)) {
      throw new Error('products.json must have a top-level "products" array.');
    }
    return parsed;
  } catch (err) {
    throw new Error(`Failed to parse products.json: ${(err as Error).message}`);
  }
}

// ─── Prices ───────────────────────────────────────────────────────────────────

/**
 * Read prices.json, or return an empty structure if it doesn't exist yet.
 */
export function readPrices(): PricesFile {
  if (!fs.existsSync(PRICES_PATH)) {
    return {
      _comment:
        "This file is auto-updated by the GitHub Actions workflow. Do not edit manually.",
      lastUpdated: null,
      prices: {},
    };
  }

  const raw = fs.readFileSync(PRICES_PATH, "utf-8");

  try {
    return JSON.parse(raw) as PricesFile;
  } catch {
    // If the file is corrupt, start fresh rather than crashing
    console.warn("prices.json is corrupt — starting fresh.");
    return {
      _comment:
        "This file is auto-updated by the GitHub Actions workflow. Do not edit manually.",
      lastUpdated: null,
      prices: {},
    };
  }
}

/**
 * Write the updated prices structure back to prices.json (pretty-printed).
 */
export function writePrices(data: PricesFile): void {
  // Ensure the data directory exists (matters for first run)
  fs.mkdirSync(DATA_DIR, { recursive: true });

  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(PRICES_PATH, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/**
 * Build an empty PriceRecord for a product that has never been checked before.
 */
export function emptyPriceRecord(productId: string, productName: string): PriceRecord {
  return {
    productId,
    productName,
    currentPrice: null,
    previousPrice: null,
    lowestPrice: null,
    lastChecked: null,
    lastError: null,
    lastErrorMessage: null,
    consecutiveFailures: 0,
  };
}
