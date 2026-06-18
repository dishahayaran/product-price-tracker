# Flipkart Price Tracker

A **free, serverless** price tracker for Flipkart products. No VPS, no database, no paid services — just GitHub Actions running twice a day.

```
products.json  →  GitHub Actions  →  Playwright  →  Flipkart
                                                         ↓
your inbox  ←  Gmail (Nodemailer)  ←  compare prices  ←  prices.json
```

## Features

- ✅ Tracks any number of Flipkart product URLs
- ✅ Runs automatically at **09:00 and 21:00 IST** every day
- ✅ Sends beautiful HTML email alerts on price drops
- ✅ Supports optional per-product **target price** alerts
- ✅ Stores full price history in `data/prices.json`
- ✅ **₹0/month** — runs entirely on GitHub Actions free tier

---

## Folder Structure

```
flipkart-price-tracker/
├── .github/
│   └── workflows/
│       └── price-check.yml    ← GitHub Actions workflow (scheduler)
├── data/
│   ├── products.json          ← YOU EDIT THIS to add products
│   └── prices.json            ← Auto-updated by the workflow
├── src/
│   ├── index.ts               ← Main orchestrator
│   ├── scraper.ts             ← Playwright price extractor
│   ├── notify.ts              ← Nodemailer email service
│   ├── storage.ts             ← JSON file read/write helpers
│   ├── logger.ts              ← Simple structured logger
│   └── types.ts               ← TypeScript type definitions
├── .env.example               ← Environment variable template
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

---

## File Formats

### `data/products.json` — you edit this

```json
{
  "products": [
    {
      "id": "iphone-16-128gb",
      "name": "Apple iPhone 16 (128GB) - Black",
      "url": "https://www.flipkart.com/apple-iphone-16-black-128-gb/p/itm...",
      "pincode": "462001",
      "targetPrice": 65000,
      "active": true
    }
  ]
}
```

| Field         | Type    | Required | Description                                              |
|---------------|---------|----------|----------------------------------------------------------|
| `id`          | string  | ✅       | Unique identifier (no spaces, use hyphens)               |
| `name`        | string  | ✅       | Display name for emails                                  |
| `url`         | string  | ✅       | Full Flipkart product page URL                           |
| `pincode`     | string  | ✅       | 6-digit Indian postal pincode for delivery price         |
| `targetPrice` | number  | ❌       | Send alert if price drops below this value (in ₹)        |
| `active`      | boolean | ✅       | Set to `false` to pause tracking without deleting        |

### `data/prices.json` — auto-managed, do not edit

```json
{
  "lastUpdated": "2024-06-18T09:00:05.123Z",
  "prices": {
    "iphone-16-128gb": {
      "productId": "iphone-16-128gb",
      "productName": "Apple iPhone 16 (128GB) - Black",
      "currentPrice": 72999,
      "previousPrice": 79900,
      "lowestPrice": 72999,
      "lastChecked": "2024-06-18T09:00:05.123Z",
      "lastError": null,
      "lastErrorMessage": null,
      "consecutiveFailures": 0
    }
  }
}
```

---

## Setup Guide

### Step 1 — Fork or create the repository

1. Fork this repository **or** push it to a new GitHub repo you own.
2. The repo must be **public** to use GitHub Actions on the free tier,  
   **or** private with Actions minutes available (GitHub gives 2,000 min/month free).

### Step 2 — Get a Gmail App Password

> **Why?** Gmail won't allow your normal password in scripts.  
> App Passwords are 16-character one-time codes that bypass 2FA for specific apps.

1. Go to your Google Account: **https://myaccount.google.com**
2. Click **Security** in the left sidebar
3. Under "How you sign in to Google", click **2-Step Verification**  
   *(Enable it if you haven't already — it's required)*
4. Scroll to the bottom and click **App passwords**
5. Enter a name like `flipkart-tracker` and click **Create**
6. Google shows a **16-character password** — copy it immediately (it won't be shown again)
7. Format: four groups of four letters, e.g. `abcd efgh ijkl mnop`

### Step 3 — Add GitHub Secrets

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.

Add these three secrets:

| Secret name      | Value                                         | Example                    |
|------------------|-----------------------------------------------|----------------------------|
| `GMAIL_USER`     | Your Gmail address                            | `yourname@gmail.com`       |
| `GMAIL_APP_PASS` | The 16-character App Password (spaces OK)     | `abcd efgh ijkl mnop`      |
| `NOTIFY_EMAIL`   | Where to send alerts (can be same as above)   | `yourname@gmail.com`       |

### Step 4 — Add your products

Edit `data/products.json`:

```jsonc
{
  "products": [
    {
      "id": "my-product-1",              // unique, no spaces
      "name": "Sony WH-1000XM5",         // display name
      "url": "https://www.flipkart.com/sony-wh-1000xm5-bluetooth-headset/p/itm...",
      "pincode": "110001",               // your 6-digit pincode
      "targetPrice": 22000,              // optional: alert below this price
      "active": true
    }
  ]
}
```

**How to get the Flipkart URL:**
1. Go to the product page on Flipkart
2. Copy the URL from your browser address bar
3. Optionally clean it up — everything before `?` is enough, e.g.:  
   `https://www.flipkart.com/apple-iphone-16-black-128-gb/p/itm6e3dcf1bf5f8b`

Commit and push `products.json`.

### Step 5 — Enable GitHub Actions

1. Go to your repo → **Actions** tab
2. If prompted, click **"I understand my workflows, go ahead and enable them"**
3. Click on **"Flipkart Price Check"** in the left sidebar
4. Click **"Run workflow"** → **"Run workflow"** to test it immediately

---

## Running Locally

```bash
# 1. Clone your forked repo
git clone https://github.com/YOUR_USERNAME/flipkart-price-tracker.git
cd flipkart-price-tracker

# 2. Install dependencies
npm install

# 3. Install Playwright's Chromium browser
npx playwright install chromium

# 4. Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Gmail credentials

# 5. Run the price check manually
node --loader ts-node/esm src/index.ts

# Test the scraper only (no email)
TEST_URL="https://www.flipkart.com/YOUR_PRODUCT_URL" \
node --loader ts-node/esm src/scraper.ts --test

# Test the email only (sends a dummy alert)
node --loader ts-node/esm src/notify.ts --test
```

---

## How Notifications Work

An email is sent when **either** condition is true:

| Condition              | When triggered                                                    |
|------------------------|-------------------------------------------------------------------|
| **Price drop**         | Current price < last recorded price (any amount)                 |
| **Target reached**     | Current price ≤ `targetPrice` in products.json                   |

**No duplicate emails:** If the price hasn't changed since the last run, no email is sent.

**First run:** No email is sent — the first check just records a baseline price.

---

## Monitoring & Debugging

- **Workflow runs:** GitHub → Actions tab → "Flipkart Price Check"
- **Logs:** Click any workflow run → expand the "Run price checker" step
- **Price history:** Browse `data/prices.json` directly in GitHub — every commit is timestamped
- **Manual trigger:** Actions → "Flipkart Price Check" → "Run workflow" → "Run workflow"
- **Debug mode:** When triggering manually, set the `debug` input to `true` for verbose logs

---

## GitHub Actions Usage & Limits

| Metric              | Free tier limit      | This workflow                    |
|---------------------|----------------------|----------------------------------|
| Minutes/month       | 2,000 min            | ~10 min × 60 runs ≈ **600 min**  |
| Storage             | 500 MB               | < 1 MB                           |
| Concurrent jobs     | 20                   | 1                                |

You stay well within free limits even with 10+ products.

---

## Troubleshooting

**"Could not find a price on the page"**  
Flipkart may have changed their CSS class names. Check the Actions log for the full page URL, open it in a browser, right-click the price → Inspect, and find the new class name. Update `PRICE_SELECTORS` in `src/scraper.ts`.

**"Missing GMAIL_USER or GMAIL_APP_PASS"**  
Verify your GitHub Secrets are named exactly `GMAIL_USER` and `GMAIL_APP_PASS` (case-sensitive).

**"Error: Invalid login" from Nodemailer**  
Your App Password is wrong or expired. Generate a new one (Step 2 above).

**"prices.json not committed"**  
Check that the repo's Actions have write permission: Settings → Actions → General → Workflow permissions → "Read and write permissions".

**Price shows ₹0 or a wrong value**  
The product might be out of stock. The scraper logs the raw text it found — check the workflow logs.

---

## Adding More Products

Just edit `data/products.json`, add entries to the `products` array, and commit. The next scheduled run picks them up automatically.

---

## Future Improvements

- Add price history chart (GitHub Pages + Chart.js reading `prices.json`)
- Support multiple notification channels (Telegram Bot API, ntfy.sh)
- Weekly summary email with all tracked products
- Price alert for increase (restocking detection)
- Support Amazon India URLs
