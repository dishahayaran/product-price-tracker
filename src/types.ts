// ─── Product Configuration (from products.json) ──────────────────────────────

export interface Product {
  /** Unique stable identifier, e.g. "iphone-16-128gb" */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Full Flipkart product URL */
  url: string;
  /** Indian postal pincode for delivery price check */
  pincode: string;
  /** Optional: send alert if price drops below this value (in INR) */
  targetPrice?: number;
  /** Set to false to skip this product without deleting it */
  active: boolean;
}

export interface ProductsFile {
  products: Product[];
}

// ─── Price Records (stored in prices.json) ───────────────────────────────────

export interface PriceRecord {
  /** Product ID matching products.json */
  productId: string;
  /** Product name at time of last check */
  productName: string;
  /** Most recently scraped price in INR. null means scrape failed. */
  currentPrice: number | null;
  /** Price from the previous successful check */
  previousPrice: number | null;
  /** Lowest price ever recorded */
  lowestPrice: number | null;
  /** ISO 8601 timestamp of the last successful scrape */
  lastChecked: string | null;
  /** ISO 8601 timestamp of the last failed scrape (for diagnostics) */
  lastError: string | null;
  /** Human-readable error message from last failed scrape */
  lastErrorMessage: string | null;
  /** Number of consecutive scrape failures */
  consecutiveFailures: number;
}

export interface PricesFile {
  _comment: string;
  lastUpdated: string | null;
  /** Keyed by product ID */
  prices: Record<string, PriceRecord>;
}

// ─── Scraper Result ───────────────────────────────────────────────────────────

export interface ScrapeResult {
  success: boolean;
  price: number | null;
  productName: string | null;
  error?: string;
}

// ─── Notification Payload ─────────────────────────────────────────────────────

export type NotificationReason = "price_drop" | "target_reached" | "both";

export interface NotificationPayload {
  product: Product;
  oldPrice: number;
  newPrice: number;
  lowestPrice: number;
  reason: NotificationReason;
  checkedAt: string;
}
