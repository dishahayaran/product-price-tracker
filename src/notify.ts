/**
 * Email notification service using Nodemailer + Gmail SMTP.
 *
 * Requires these environment variables (set as GitHub Secrets):
 *   GMAIL_USER     — your Gmail address (e.g. yourname@gmail.com)
 *   GMAIL_APP_PASS — 16-character Gmail App Password (not your login password)
 *   NOTIFY_EMAIL   — destination address to send alerts to (can be same as GMAIL_USER)
 */

import nodemailer from "nodemailer";
import { NotificationPayload } from "./types";
import { logger } from "./logger";

// ─── Transporter ──────────────────────────────────────────────────────────────

function createTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASS;

  if (!user || !pass) {
    throw new Error(
      "Missing GMAIL_USER or GMAIL_APP_PASS environment variables.\n" +
        "Set them as GitHub Secrets (see README for instructions)."
    );
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

// ─── Email Template ───────────────────────────────────────────────────────────

function formatINR(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

function buildEmailContent(payload: NotificationPayload): {
  subject: string;
  html: string;
  text: string;
} {
  const { product, oldPrice, newPrice, lowestPrice, reason, checkedAt } = payload;
  const drop = oldPrice - newPrice;
  const dropPct = ((drop / oldPrice) * 100).toFixed(1);
  const isNewLowest = newPrice <= lowestPrice;

  const reasonLabel =
    reason === "both"
      ? "🎯 Price dropped below your target!"
      : reason === "target_reached"
      ? "🎯 Price dropped below your target!"
      : "📉 Price drop detected!";

  const subject = `${reasonLabel} ${product.name} is now ${formatINR(newPrice)}`;

  const badgeStyle =
    "display:inline-block;padding:4px 12px;border-radius:4px;font-weight:bold;";
  const lowestBadge = isNewLowest
    ? `<span style="${badgeStyle}background:#16a34a;color:white;">🏆 New Lowest Price!</span>`
    : "";
  const targetBadge =
    product.targetPrice && newPrice <= product.targetPrice
      ? `<span style="${badgeStyle}background:#2563eb;color:white;">🎯 Below Target Price!</span>`
      : "";

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Price Alert</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:12px;overflow:hidden;
                      box-shadow:0 2px 8px rgba(0,0,0,0.08);max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#2874f0;padding:24px 32px;">
              <h1 style="margin:0;color:white;font-size:22px;font-weight:700;">
                Flipkart Price Alert
              </h1>
              <p style="margin:4px 0 0;color:#c7d9ff;font-size:13px;">
                Checked at ${new Date(checkedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST
              </p>
            </td>
          </tr>

          <!-- Product name -->
          <tr>
            <td style="padding:24px 32px 0;">
              <h2 style="margin:0;color:#111827;font-size:17px;font-weight:600;line-height:1.4;">
                ${product.name}
              </h2>
              <div style="margin-top:8px;">${lowestBadge} ${targetBadge}</div>
            </td>
          </tr>

          <!-- Price summary card -->
          <tr>
            <td style="padding:20px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">
                <tr>
                  <td style="padding:20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="text-align:center;width:33%;">
                          <p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Previous</p>
                          <p style="margin:0;color:#ef4444;font-size:22px;font-weight:700;text-decoration:line-through;">
                            ${formatINR(oldPrice)}
                          </p>
                        </td>
                        <td style="text-align:center;width:33%;">
                          <p style="font-size:28px;margin:0;color:#16a34a;">→</p>
                        </td>
                        <td style="text-align:center;width:33%;">
                          <p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Now</p>
                          <p style="margin:0;color:#16a34a;font-size:28px;font-weight:800;">
                            ${formatINR(newPrice)}
                          </p>
                        </td>
                      </tr>
                    </table>
                    <hr style="border:none;border-top:1px solid #bbf7d0;margin:16px 0;" />
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="color:#374151;font-size:14px;">
                          💰 You save <strong>${formatINR(drop)} (${dropPct}%)</strong>
                        </td>
                        <td align="right" style="color:#374151;font-size:14px;">
                          🏆 Lowest ever: <strong>${formatINR(lowestPrice)}</strong>
                        </td>
                      </tr>
                      ${
                        product.targetPrice
                          ? `<tr>
                        <td colspan="2" style="color:#374151;font-size:14px;padding-top:8px;">
                          🎯 Your target: <strong>${formatINR(product.targetPrice)}</strong>
                          ${newPrice <= product.targetPrice ? " ✅ Reached!" : ` — ${formatINR(newPrice - product.targetPrice)} away`}
                        </td>
                      </tr>`
                          : ""
                      }
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td style="padding:0 32px 28px;" align="center">
              <a href="${product.url}"
                 style="display:inline-block;background:#2874f0;color:white;
                        text-decoration:none;padding:14px 40px;border-radius:6px;
                        font-weight:700;font-size:15px;letter-spacing:0.01em;">
                View on Flipkart →
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
                Pincode: ${product.pincode} &nbsp;|&nbsp;
                Tracked by Flipkart Price Tracker (GitHub Actions)
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  const text = `
FLIPKART PRICE ALERT
====================
Product : ${product.name}
URL     : ${product.url}
Pincode : ${product.pincode}
Checked : ${new Date(checkedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST

PRICES
------
Previous price : ${formatINR(oldPrice)}
Current price  : ${formatINR(newPrice)}
Saving         : ${formatINR(drop)} (${dropPct}% off)
Lowest ever    : ${formatINR(lowestPrice)}
${product.targetPrice ? `Target price   : ${formatINR(product.targetPrice)} ${newPrice <= product.targetPrice ? "(✅ Reached!)" : `(${formatINR(newPrice - product.targetPrice)} away)`}` : ""}

${isNewLowest ? "🏆 This is the new lowest recorded price!\n" : ""}
`.trim();

  return { subject, html, text };
}

// ─── Send Notification ────────────────────────────────────────────────────────

export async function sendPriceAlert(payload: NotificationPayload): Promise<void> {
  const to = process.env.NOTIFY_EMAIL || process.env.GMAIL_USER;
  if (!to) {
    throw new Error("NOTIFY_EMAIL (or GMAIL_USER) environment variable not set.");
  }

  const transporter = createTransporter();
  const { subject, html, text } = buildEmailContent(payload);

  logger.info(`Sending price alert email to ${to}`, {
    product: payload.product.name,
    newPrice: payload.newPrice,
  });

  const info = await transporter.sendMail({
    from: `"Flipkart Price Tracker" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text,
    html,
  });

  logger.info(`Email sent`, { messageId: info.messageId });
}

// ─── CLI Test Entry Point ─────────────────────────────────────────────────────

if (process.argv.includes("--test")) {
  (async () => {
    const testPayload: NotificationPayload = {
      product: {
        id: "test",
        name: "Apple iPhone 16 (128GB, Black)",
        url: "https://www.flipkart.com/",
        pincode: "462001",
        targetPrice: 65000,
        active: true,
      },
      oldPrice: 79900,
      newPrice: 72999,
      lowestPrice: 72999,
      reason: "both",
      checkedAt: new Date().toISOString(),
    };

    console.log("Sending test email…");
    await sendPriceAlert(testPayload);
    console.log("Test email sent — check your inbox.");
  })().catch((err) => {
    console.error("Test failed:", err.message);
    process.exit(1);
  });
}
