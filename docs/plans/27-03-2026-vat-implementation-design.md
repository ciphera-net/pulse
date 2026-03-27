# VAT Implementation Design

## Goal

Add EU VAT handling to the Pulse checkout and subscription flow. Prices are shown and charged excl. VAT; VAT is calculated at checkout based on customer country and VAT ID, and added to the Mollie charge.

## VAT Rules

| Customer | Rate | Reason |
|----------|------|--------|
| Country = BE | 21% | Belgian VAT |
| EU country + valid VIES VAT ID | 0% | Reverse charge (intra-community) |
| EU country + no/invalid VAT ID | 21% | Belgian VAT (no OSS registration) |
| Non-EU country | 0% | Outside EU scope |

---

## Architecture

Backend-only VAT calculation. Frontend calls a new endpoint when country/VAT ID changes and displays the breakdown. Backend validates VIES, calculates totals, and charges the VAT-inclusive amount through Mollie.

---

## Section 1: New Endpoint — `POST /api/billing/calculate-vat`

**Request:**
```json
{
  "plan_id": "solo",
  "interval": "month",
  "limit": 10000,
  "country": "BE",
  "vat_id": ""
}
```

**Response:**
```json
{
  "base_amount": "7.00",
  "vat_rate": 21,
  "vat_amount": "1.47",
  "total_amount": "8.47",
  "vat_exempt": false,
  "vat_reason": ""
}
```

VAT-exempt example (valid EU VAT ID):
```json
{
  "base_amount": "7.00",
  "vat_rate": 0,
  "vat_amount": "0.00",
  "total_amount": "7.00",
  "vat_exempt": true,
  "vat_reason": "Reverse charge (intra-community)"
}
```

---

## Section 2: New Backend Module — `internal/billing/vat.go`

**Functions:**
- `CalculateVAT(planID, interval string, limit int64, country, vatID string) (*VATResult, error)` — main entry point
- `validateVIES(countryCode, vatNumber string) (bool, error)` — calls EU VIES REST API (`https://ec.europa.eu/taxation_customs/vies/rest-api/ms/{country}/vat/{number}`)
- `isEUCountry(country string) bool` — static list of 27 EU member state codes
- In-memory VIES cache: 24h TTL per `countryCode+vatNumber` key

**`EmbeddedCheckoutHandler` changes:**
- Call `CalculateVAT` instead of `GetSubscriptionAmount` for the subscription amount
- Store VAT breakdown in payment metadata: `vat_rate`, `vat_amount`, `base_amount`, `total_amount`

**`handleFirstPaymentCompleted` changes:**
- Read `total_amount` from metadata for the recurring subscription charge (not `amount`)

**`ChangePlanHandler` changes:**
- Call `CalculateVAT` using stored `billing_country` + `vat_id` from `organization_billing`

---

## Section 3: Frontend Changes

**State lifting in `CheckoutContent` (`app/checkout/page.tsx`):**
- `country` and `vatId` state lifted up from `PaymentForm` to `CheckoutContent`
- Passed down to both `PlanSummary` (display) and `PaymentForm` (submission)

**`PlanSummary.tsx`:**
- Accepts `country`, `vatId`, `onCountryChange`, `onVatIdChange` props
- Country selector and VAT ID input moved here from `PaymentForm`
- Calls `POST /api/billing/calculate-vat` on country/VAT ID change (debounced 400ms)
- Shows VAT breakdown when country is selected:
  ```
  €7.00 /mo    excl. VAT
  VAT 21%      €1.47
  ──────────────────────
  Total        €8.47 /mo
  ```
- Shows "Reverse charge" note when VAT-exempt
- Loading spinner while VIES validates

**`PaymentForm.tsx`:**
- Country + VAT ID inputs removed
- Receives `totalAmount`, `country`, `vatId` as props
- Submit button shows: "Start free trial · €8.47/mo"
- Passes `country` + `vat_id` to `createEmbeddedCheckout` as before

**`PricingSection.tsx`:**
- Add small "excl. VAT" label under each plan price

---

## Data Flow

```
User selects country / enters VAT ID
  → PlanSummary debounce 400ms
  → POST /api/billing/calculate-vat
    → CalculateVAT()
      → validateVIES() if VAT ID provided (cached 24h)
      → return VATResult
  → Display breakdown in PlanSummary
  → Pass totalAmount to PaymentForm submit button

User clicks "Start free trial"
  → POST /api/billing/checkout-embedded (country + vat_id + card_token)
    → CalculateVAT() (re-validated server-side)
    → CreateFirstPaymentWithToken("0.00") — trial mandate, no charge
    → handleFirstPaymentCompleted()
      → CreateSubscription(totalAmount) — VAT-inclusive recurring amount
```

---

## Error Handling

- VIES API down → treat as invalid VAT ID (charge 21%) — log warning
- VIES validation failed → show "VAT ID could not be verified, 21% VAT will apply"
- Country not selected → no VAT breakdown shown, checkout blocked

---

## Files Changed

| Action | File |
|--------|------|
| New | `pulse-backend/internal/billing/vat.go` |
| New | `POST /api/billing/calculate-vat` in `billing_handlers.go` |
| Modified | `EmbeddedCheckoutHandler` in `billing_handlers.go` |
| Modified | `handleFirstPaymentCompleted` in `billing_handlers.go` |
| Modified | `ChangePlanHandler` in `billing_handlers.go` |
| Modified | `pulse-frontend/app/checkout/page.tsx` |
| Modified | `pulse-frontend/components/checkout/PlanSummary.tsx` |
| Modified | `pulse-frontend/components/checkout/PaymentForm.tsx` |
| Modified | `pulse-frontend/components/PricingSection.tsx` |
