/**
 * Main entry point — runs the full price-check cycle:
 *
 *  1. Read products from products.json
 *  2. Read previous prices from prices.json
 *  3. For each active product:
 *     a. Scrape current price from Flipkart
 *     b. Compare with previous price
 *     c. Send email notification if price dropped or target reached
 *     d. Update price record
 *  4. Write updated prices back to prices.json
 *
 * Called by the GitHub Actions workflow twice daily.
 */

import { scrapeProduct } from "./scraper";
import { sendPriceAlert } from "./notify";
import { readProducts, readPrices, writePrices, emptyPriceRecord } from "./storage";
import { logger } from "./logger";
import {
  Product,
  PriceRecord,
  NotificationPayload,
  NotificationReason,
} from "./types";

// ─── Notification Decision ────────────────────────────────────────────────────

/**
 * Decide whether to send a notification and what kind.
 * Returns null if no notification should be sent.
 */
function getNotificationReason(
  product: Product,
  newPrice: number,
  previousPrice: number | null
): NotificationReason | null {
  const priceDrop = previousPrice !== null && newPrice < previousPrice;
  const targetReached =
    product.targetPrice !== undefined &&
    product.targetPrice !== null &&
    newPrice <= product.targetPrice;

  if (priceDrop && targetReached) return "both";
  if (priceDrop) return "price_drop";
  if (targetReached) return "target_reached";
  return null;
}

// ─── Process Single Product ───────────────────────────────────────────────────

async function processProduct(
  product: Product,
  existingRecord: PriceRecord | undefined
): Promise<PriceRecord> {
  // Start from existing record or create a blank one
  const record: PriceRecord = existingRecord ?? emptyPriceRecord(product.id, product.name);

  const result = await scrapeProduct(product);

  if (!result.success || result.price === null) {
    // Scrape failed — update error fields, keep last known price
    logger.warn(`Scrape failed for "${product.name}"`, { error: result.error });
    record.consecutiveFailures++;
    record.lastError = new Date().toISOString();
    record.lastErrorMessage = result.error ?? "Unknown error";
    return record;
  }

  const newPrice = result.price;
  const previousPrice = record.currentPrice; // could be null on first run

  // Update the name if the scraper found a better one
  if (result.productName && result.productName !== record.productName) {
    record.productName = result.productName;
  }

  // Decide on notification BEFORE updating the record
  const reason = getNotificationReason(product, newPrice, previousPrice);

  const lowestPrice =
    record.lowestPrice === null
      ? newPrice
      : Math.min(record.lowestPrice, newPrice);

  const checkedAt = new Date().toISOString();

  // Send notification if warranted
  if (reason !== null && previousPrice !== null) {
    const payload: NotificationPayload = {
      product,
      oldPrice: previousPrice,
      newPrice,
      lowestPrice,
      reason,
      checkedAt,
    };

    try {
      await sendPriceAlert(payload);
    } catch (emailErr) {
      // Email failure must not crash the run — prices still get saved
      logger.error(`Failed to send email for "${product.name}"`, {
        error: (emailErr as Error).message,
      });
    }
  } else if (reason === null && previousPrice !== null) {
    if (newPrice > previousPrice) {
      logger.info(
        `Price increased for "${product.name}": ₹${previousPrice.toLocaleString("en-IN")} → ₹${newPrice.toLocaleString("en-IN")} — no alert.`
      );
    } else if (newPrice === previousPrice) {
      logger.info(`Price unchanged for "${product.name}": ₹${newPrice.toLocaleString("en-IN")}`);
    }
  } else if (previousPrice === null) {
    logger.info(
      `First check for "${product.name}": ₹${newPrice.toLocaleString("en-IN")} — baseline recorded.`
    );
  }

  // Update record
  record.previousPrice = previousPrice;
  record.currentPrice = newPrice;
  record.lowestPrice = lowestPrice;
  record.lastChecked = checkedAt;
  record.consecutiveFailures = 0;
  record.lastError = null;
  record.lastErrorMessage = null;

  return record;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  logger.info("═══════════════════════════════════════════");
  logger.info("  Flipkart Price Tracker — starting run");
  logger.info(`  Time: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`);
  logger.info("═══════════════════════════════════════════");

  // 1. Load configuration
  const { products } = readProducts();
  const pricesFile = readPrices();

  const activeProducts = products.filter((p) => p.active);

  if (activeProducts.length === 0) {
    logger.warn("No active products found in products.json. Nothing to do.");
    return;
  }

  logger.info(`Found ${activeProducts.length} active product(s) to check.`);

  // 2. Process each product sequentially
  //    Sequential (not parallel) to be polite to Flipkart's servers
  let checkedCount = 0;
  let failedCount = 0;
  let alertsSent = 0;

  for (const product of activeProducts) {
    logger.info(`─── Checking: ${product.name}`);

    const existingRecord = pricesFile.prices[product.id];
    const prevPrice = existingRecord?.currentPrice ?? null;

    const updatedRecord = await processProduct(product, existingRecord);
    pricesFile.prices[product.id] = updatedRecord;

    if (updatedRecord.consecutiveFailures > 0) {
      failedCount++;
    } else {
      checkedCount++;
      // Count if an alert was triggered (newPrice < prevPrice)
      if (prevPrice !== null && updatedRecord.currentPrice !== null &&
          updatedRecord.currentPrice < prevPrice) {
        alertsSent++;
      }
    }

    // Polite inter-request delay (5–10 seconds)
    if (activeProducts.indexOf(product) < activeProducts.length - 1) {
      const delay = 5_000 + Math.random() * 5_000;
      logger.debug(`Waiting ${(delay / 1000).toFixed(1)}s before next request…`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  // 3. Persist updated prices
  writePrices(pricesFile);
  logger.info("prices.json updated successfully.");

  // 4. Summary
  logger.info("═══════════════════════════════════════════");
  logger.info(`  Run complete`);
  logger.info(`  ✓ Checked:     ${checkedCount}`);
  logger.info(`  ✗ Failed:      ${failedCount}`);
  logger.info(`  📧 Alerts sent: ${alertsSent}`);
  logger.info("═══════════════════════════════════════════");

  // Exit with non-zero if all products failed, so GitHub Actions marks run as failed
  if (failedCount > 0 && checkedCount === 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error("Fatal error in main", { error: err.message, stack: err.stack });
  process.exit(1);
});
