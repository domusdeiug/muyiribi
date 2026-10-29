# Muyiribi

UgOnline · Muyiribi helps people compare marketplace products with an AI assistant, while its website focuses on a Ugandan business directory. Cloudflare Worker + Neon Postgres, with a business-directory web UI and an MCP endpoint for both journeys.

## Routes

- `/` business-directory landing page
- `/search` public **business** search by keyword, category, and district (not a product-search page)
- `/signup`, `/login`, `/logout` phone + password accounts (password show/hide toggle)
- `/dashboard` manage the signed-in account's business listings and plan capacity
- `/add` add a business listing (creation limit depends on tier; description min 40 characters)
- `/listings/:id/edit` securely edit a listing owned by the signed-in account
- `/mcp` MCP endpoint with business-directory tools (`search_businesses`, `get_business`, `list_categories`, `get_listing_signup_link`) and `search_marketplace` for Jiji Uganda products

Business-directory results are ranked by tier; marketplace product results are separate, unsponsored, and ranked by title relevance and recency.

## Setup

1. Run `schema.sql` once in the Neon SQL console.
2. Install dependencies: `npm install`
3. Set the database secret: `npx wrangler secret put DATABASE_URL` (your Neon connection string)
4. Local dev: `npm run dev`
5. Deploy: `npm run deploy`

Your MCP URL is: `https://ug-online.domus-dei-tech.workers.dev/mcp`.

## Marketplace search

`search_marketplace` searches public Jiji Uganda adverts, separately from the Muyiribi business directory. Supply a `query` and optionally complete item phrases in `synonyms` (e.g. `wedding gown` with `wedding dress`, `bridal gown`, `bridal dress`). Other inputs include UGX price bounds, region, page, sort, result target, fetch-page cap and relevance threshold. The tool returns listing titles, prices, a first image URL, image count, attributes and the original Jiji listing link. No contact information is scraped; users follow that link to Jiji.

The ChatGPT marketplace widget renders product cards with photos from Jiji's image CDN and links to the Jiji listings. Other MCP clients receive the same structured data and text, but may not render the widget. Image availability depends on Jiji's CDN. The Worker fetches Jiji anonymously; if Jiji blocks Cloudflare-origin traffic, the tool reports an upstream error rather than showing an empty result.

Searches use complete title-phrase matching and a newest-first candidate pool (with one-page lookahead); explicit price sorts return one unscored page, matching the original Python tool. Search responses are cached for 20 minutes in Cloudflare's per-datacenter Cache API (best effort, not a globally shared cache).

Run offline tests with `npm test` and check types with `npm run type-check`. Deployment is separate: `npm run deploy`.

## Notes

- Passwords are hashed with PBKDF2 (Web Crypto). Accounts lock for 15 minutes after 5 failed logins.
- Creation limit (how many listings an account can create): Free 3, Basic 5, Pro 7, Premium unlimited.
- Search limit (how many of an account's listings can appear in search): Free 1, Basic 3, Pro 5, Premium unlimited. Newest first.
- Results are ordered by tier, highest first.
- Paid tiers only count while an active subscription exists. No flow creates subscriptions yet; payments come later.
- `/pricing` shows all tiers and sells them via PesaPal. Every paid tier (Basic UGX 5,000/yr,
  Pro UGX 12,000/yr, Premium UGX 25,000/yr) requires business contact phone verification by SMS
  OTP (sent via UgaText) before the tier is granted. See `migrations/002_verification.sql` and
  `migrations/003_tier_names_and_pricing.sql`, and `migrations/004_payment_phone_optional.sql`.
- Paid-tier flow is one page. "Get <tier>" creates a PesaPal order and shows its checkout in an
  iframe on `/pricing/status`. The page polls `/pricing/check` until payment completes, then
  asks for the verification number (prefilled, editable) and sends the SMS code. Status is only
  trusted from PesaPal's GetTransactionStatus, never from the callback URL.

## MCP Registry

- step 0:
  update version in server.json

- step 1:
  curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')\_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher
  chmod +x mcp-publisher

- step 2:
  ./mcp-publisher login github
  ./mcp-publisher validate server.json
  ./mcp-publisher publish server.json

## MCP
- Do the first command from outside the folder you want to create.
- Change my-mcp-server to the name of your server
scaffold: npm create cloudflare@latest -- my-mcp-server --template=cloudflare/ai/demos/remote-mcp-authless   
get token for workers from cloudflare
cd my-mcp
npm install
npx wrangler dev # local dev
npx wrangler deploy # deploy
