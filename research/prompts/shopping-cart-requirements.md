# Product Requirements — Shopping Cart Feature

## Product Context

**Application:** GlobalMart — an international e-commerce web application
**URL:** https://www.globalmart.example.com
**Feature scope:** Shopping cart (add to cart, cart page, cart management). This document covers ONLY the shopping cart feature, not product browsing, checkout, payment, or account management.

**Technology:** Web application (responsive, works on desktop and mobile browsers). The cart is client-side with server synchronization — cart state is stored in the browser (localStorage) and synced to the server when the user is authenticated.

**Users:** International customers shopping in multiple languages and currencies. The application supports English (en), Arabic (ar), and Japanese (ja) locales.

---

## Data Model

### Products

Products in the GlobalMart catalog have the following attributes:

| Attribute | Description | Constraints |
|-----------|-------------|-------------|
| `productId` | Unique identifier | String, alphanumeric, e.g., `SKU-001` |
| `name` | Product name (localized) | Object with locale keys: `{ en: "...", ar: "...", ja: "..." }` |
| `description` | Product description (localized) | Same structure as name |
| `price` | Unit price | Object with currency keys: `{ USD: 29.99, EUR: 27.50, JPY: 4500 }` |
| `currency` | Display currency | Determined by user's locale setting |
| `imageUrl` | Product thumbnail | URL string |
| `inventory` | Available stock quantity | Integer >= 0 |
| `maxPerOrder` | Maximum quantity per order | Integer, default 99 |
| `weight` | Shipping weight in kg | Decimal |

### Sample Product Data

The following products exist in the catalog and should be used as reference data for test cases:

| SKU | English Name | Arabic Name | Japanese Name | USD | EUR | JPY | Inventory | Max/Order |
|-----|-------------|-------------|---------------|-----|-----|-----|-----------|-----------|
| SKU-001 | Wireless Headphones | سماعات لاسلكية | ワイヤレスヘッドフォン | 79.99 | 73.50 | 12000 | 150 | 10 |
| SKU-002 | Leather Notebook | دفتر جلد | 革のノートブック | 24.95 | 22.90 | 3800 | 500 | 25 |
| SKU-003 | Ceramic Coffee Mug | كوب قهوة سيراميك | セラミックコーヒーマグ | 14.50 | 13.30 | 2200 | 1000 | 50 |
| SKU-004 | Standing Desk Lamp | مصباح مكتب قائم | スタンディングデスクランプ | 149.00 | 136.80 | 22500 | 30 | 5 |
| SKU-005 | Organic Tea Set | طقم شاي عضوي | オーガニックティーセット | 39.99 | 36.70 | 6100 | 75 | 10 |
| SKU-006 | USB-C Hub Adapter | محول USB-C | USB-Cハブアダプター | 45.00 | 41.30 | 6800 | 200 | 15 |

### Tax Rules

- US locale: Sales tax of 8.25% applied to subtotal after discounts.
- EU locale: VAT of 20% included in displayed prices (prices shown are VAT-inclusive).
- JP locale: Consumption tax of 10% applied to subtotal after discounts.

### Discount Codes

| Code | Type | Value | Conditions |
|------|------|-------|------------|
| `SAVE10` | Percentage | 10% off subtotal | Minimum cart value $50 USD (or equivalent) |
| `FLAT5` | Fixed amount | $5.00 USD / €4.60 EUR / ¥750 JPY | No minimum. One per order. |
| `FREESHIP` | Free shipping | Waives shipping fee | Minimum cart value $100 USD (or equivalent) |
| `EXPIRED2024` | Percentage | 15% off | Expired code — should be rejected |
| `EMPLOYEE50` | Percentage | 50% off | Restricted — requires authenticated employee account |

---

## Feature Requirements

### REQ-CART-ADD: Adding Items to Cart

**REQ-CART-ADD-01:** When a user clicks "Add to Cart" on a product, the product is added to the cart with a quantity of 1. If the product is already in the cart, its quantity increments by 1.

**REQ-CART-ADD-02:** The "Add to Cart" button must be disabled and display "Out of Stock" when a product's inventory is 0.

**REQ-CART-ADD-03:** If adding one more unit would exceed the product's `maxPerOrder` limit, the "Add to Cart" button must be disabled and display "Maximum quantity reached."

**REQ-CART-ADD-04:** If adding one more unit would exceed the product's available `inventory`, the "Add to Cart" button must be disabled and display "Only {n} available" where `{n}` is the remaining quantity.

**REQ-CART-ADD-05:** After a successful add-to-cart action, a toast notification appears for 3 seconds confirming the addition. The toast displays the product name in the user's current locale and the updated cart item count.

### REQ-CART-DISPLAY: Cart Page Layout

**REQ-CART-DISPLAY-01:** The cart page displays a list of all items currently in the cart. Each line item shows: product thumbnail, product name (in the user's locale), unit price (in the user's currency), quantity, and line item total (unit price × quantity).

**REQ-CART-DISPLAY-02:** Below the line items, the cart displays:
- **Subtotal:** Sum of all line item totals.
- **Discount:** Discount amount if a valid code is applied (displayed as a negative value, e.g., "-$5.00"). Hidden if no discount is applied.
- **Tax:** Calculated tax amount based on locale rules (see Tax Rules above). Label shows the tax type: "Sales Tax (8.25%)" for US, "VAT (included)" for EU, "Consumption Tax (10%)" for JP.
- **Shipping:** Shipping cost or "FREE" if free shipping applies. Standard shipping is $5.99 USD / €5.50 EUR / ¥900 JPY.
- **Total:** Final amount = Subtotal − Discount + Tax + Shipping. For EU locale, Total = Subtotal − Discount + Shipping (VAT is already included in prices).

**REQ-CART-DISPLAY-03:** When the cart is empty, the cart page displays: a cart icon, the text "Your cart is empty" (localized), and a "Continue Shopping" button that navigates to the product catalog.

**REQ-CART-DISPLAY-04:** The cart page header displays "Shopping Cart ({n} items)" where `{n}` is the total number of items (sum of all quantities, not unique products). The text is localized. In Arabic: "سلة التسوق ({n} عناصر)". In Japanese: "ショッピングカート（{n}点）".

**REQ-CART-DISPLAY-05:** All prices are formatted according to the user's locale:
- English (US): `$1,234.56`
- Arabic: `١٬٢٣٤٫٥٦ $` (Eastern Arabic numerals, currency symbol after number)
- Japanese: `¥1,234` (no decimal places for JPY)

### REQ-CART-QTY: Quantity Management

**REQ-CART-QTY-01:** Each line item has a quantity control consisting of a "−" button, a numeric input field displaying the current quantity, and a "+" button.

**REQ-CART-QTY-02:** The "−" button decreases quantity by 1. When quantity is 1, pressing "−" opens a confirmation dialog: "Remove {product name} from your cart?" with "Remove" and "Cancel" buttons.

**REQ-CART-QTY-03:** The "+" button increases quantity by 1, up to the lesser of `maxPerOrder` and available `inventory`. When the limit is reached, the "+" button becomes disabled and a tooltip displays the reason: "Maximum {n} per order" or "Only {n} in stock."

**REQ-CART-QTY-04:** The user can type a quantity directly into the numeric input field. The field accepts only positive integers (1 through the applicable maximum). On blur, if the entered value is:
- Less than 1 or empty: revert to 1.
- Greater than the applicable maximum: set to the maximum and display a brief message explaining the limit.
- A valid integer: update the quantity.
- Non-numeric or decimal: revert to the previous valid quantity.

**REQ-CART-QTY-05:** All price totals (line item total, subtotal, discount, tax, shipping, total) update immediately when quantity changes. No page reload required.

### REQ-CART-REMOVE: Removing Items

**REQ-CART-REMOVE-01:** Each line item has a "Remove" button (trash icon). Clicking it opens a confirmation dialog: "Remove {product name} from your cart?" with "Remove" and "Cancel" buttons.

**REQ-CART-REMOVE-02:** After removing an item, the cart updates immediately. If the cart becomes empty, the empty cart state (REQ-CART-DISPLAY-03) is displayed.

**REQ-CART-REMOVE-03:** A "Clear Cart" button appears in the cart header when the cart contains 2 or more unique products. Clicking it opens a confirmation dialog: "Remove all items from your cart?" with "Clear Cart" and "Cancel" buttons. This action removes all items.

### REQ-CART-DISCOUNT: Discount Code Application

**REQ-CART-DISCOUNT-01:** The cart page contains a text input field labeled "Discount Code" and an "Apply" button.

**REQ-CART-DISCOUNT-02:** When a valid discount code is applied:
- The discount amount appears in the price summary.
- The discount code is displayed with a "×" button to remove it.
- The "Apply" button changes to "Applied ✓" and the input field is disabled.
- Only one discount code can be active at a time.

**REQ-CART-DISCOUNT-03:** When an invalid, expired, or restricted discount code is entered, an error message appears below the input field:
- Unknown code: "Invalid discount code."
- Expired code: "This discount code has expired."
- Restricted code: "This discount code is not available for your account."
- Minimum not met: "Minimum cart value of {amount} required for this code."

**REQ-CART-DISCOUNT-04:** Percentage discounts are calculated on the subtotal (before tax and shipping). Fixed-amount discounts are subtracted from the subtotal. The discount amount cannot exceed the subtotal (no negative totals).

**REQ-CART-DISCOUNT-05:** If a discount code has a minimum cart value requirement and the user reduces the cart value below the minimum (by removing items or reducing quantities), the discount is automatically removed and a notification displays: "Discount code {code} removed — minimum cart value no longer met."

### REQ-CART-BADGE: Cart Icon Badge

**REQ-CART-BADGE-01:** A cart icon in the site header displays a badge with the total item count (sum of quantities). The badge is visible on all pages, not just the cart page.

**REQ-CART-BADGE-02:** The badge updates immediately when items are added, removed, or quantities change — without a page reload.

**REQ-CART-BADGE-03:** When the cart is empty, the badge is hidden (not displayed as "0").

**REQ-CART-BADGE-04:** When the total item count exceeds 99, the badge displays "99+".

### REQ-CART-PERSIST: Cart Persistence

**REQ-CART-PERSIST-01:** Cart contents persist across page navigation within the same session.

**REQ-CART-PERSIST-02:** Cart contents persist across browser refreshes (stored in localStorage).

**REQ-CART-PERSIST-03:** For authenticated users, the cart is synced to the server. If the user logs in on a different device, the server cart is loaded. If items exist in both the local cart and server cart, the carts are merged (quantities are summed, respecting maxPerOrder limits).

**REQ-CART-PERSIST-04:** Cart contents persist for unauthenticated users for 30 days via localStorage. After 30 days, the cart is cleared.

### REQ-CART-A11Y: Accessibility

**REQ-CART-A11Y-01:** All cart controls (quantity buttons, remove buttons, discount input, apply button) are keyboard-accessible. Tab order follows visual order: line items top to bottom, then discount code section, then price summary.

**REQ-CART-A11Y-02:** Quantity changes are announced to screen readers via an ARIA live region: "{product name}: quantity updated to {n}."

**REQ-CART-A11Y-03:** The removal confirmation dialog traps focus. When the dialog opens, focus moves to the "Cancel" button. After the dialog closes, focus returns to the next logical element (the next line item's remove button, or the empty cart message if no items remain).

**REQ-CART-A11Y-04:** All price values have ARIA labels that include the full currency name, e.g., `aria-label="Subtotal: 104 dollars and 94 cents"` rather than just displaying "$104.94."

**REQ-CART-A11Y-05:** Color is not the only indicator of state. The disabled state of buttons uses both color change AND an additional visual cue (e.g., opacity change and cursor change).

### REQ-CART-RESPONSIVE: Responsive Design

**REQ-CART-RESPONSIVE-01:** On viewports 768px and wider (tablet/desktop), the cart displays as a table with columns: Product, Unit Price, Quantity, Total, Remove.

**REQ-CART-RESPONSIVE-02:** On viewports narrower than 768px (mobile), each cart item displays as a card with the product image on the left and details stacked vertically on the right. Quantity controls and remove button are below the product details.

**REQ-CART-RESPONSIVE-03:** Touch targets for all interactive elements (buttons, inputs) are at least 44×44px on mobile viewports.

---

## Edge Cases and Risks

This section documents scenarios that are likely to produce defects if not explicitly tested. Test cases that address these scenarios demonstrate deeper QE expertise.

### Calculation Edge Cases
- **Floating-point arithmetic:** USD prices like $14.50 × 3 = $43.50, but intermediate calculations may produce floating-point errors (e.g., 14.50 * 3 = 43.499999999...). All displayed prices must be rounded to 2 decimal places (or 0 for JPY).
- **Discount exceeds subtotal:** If a fixed $5 discount is applied and the user removes items until the subtotal is less than $5, the discount must not create a negative subtotal. The discount should cap at the subtotal value.
- **Tax on discounted amount:** Tax must be calculated on the post-discount subtotal, not the pre-discount subtotal.
- **Currency conversion edge cases:** JPY has no decimal places. Ensure all JPY amounts are displayed as integers with no decimal point.

### Inventory and Concurrency
- **Inventory changes during session:** A product has 5 units in stock. The user adds 3 to their cart. Another user purchases 4 units. When the first user views their cart or proceeds to checkout, the system must indicate that only 1 unit is now available and adjust the quantity accordingly with a notification.
- **Max-per-order and inventory interaction:** If a product has `maxPerOrder: 10` but only 3 in stock, the effective maximum is 3, not 10.

### Internationalization Edge Cases
- **Mixed-direction text:** A product name that contains both Arabic and English text (e.g., "محول USB-C" / "USB-C Hub Adapter") must render correctly with proper bidirectional text handling. The Arabic text flows RTL while "USB-C" within it flows LTR.
- **Number formatting by locale:** The number 1,234.56 in English displays as ١٬٢٣٤٫٥٦ in Arabic (using Eastern Arabic numerals and the Arabic decimal separator).
- **Currency symbol position:** In English, the currency symbol precedes the amount ($79.99). In Arabic, the currency symbol follows the amount (٧٩٫٩٩ $). In Japanese, the symbol precedes (¥12,000).
- **Pluralization:** "1 item" vs. "2 items" in English. Arabic has six plural forms. Japanese does not pluralize. The cart header and badge must handle pluralization correctly per locale.

### State Management Edge Cases
- **Cart merge on login:** User adds 2 units of SKU-001 while unauthenticated. Then logs in, and their server cart already has 3 units of SKU-001. The merged cart should have 5 units (if within limits) and the user should be notified of the merge.
- **Discount code and locale switch:** User applies SAVE10 discount in English locale, then switches to Japanese locale. The discount should remain applied, but the minimum cart value check should use the JPY equivalent.
- **Removing the last item with an active discount:** If the discount has a minimum cart value, removing the last qualifying item should remove the discount code and update the total accordingly.

### Security Risks
- **Client-side price manipulation:** Prices displayed in the UI are for display only. All price calculations must be validated server-side before checkout. The cart should not accept modified price values from the client.
- **Quantity manipulation via URL or localStorage:** If a user manually edits localStorage to set a product quantity to -1 or 999999, the application must validate and sanitize the value (clamp to 1–maxPerOrder).
- **Discount code brute force:** The discount code input should implement rate limiting or CAPTCHA after 5 consecutive invalid attempts.
- **XSS via product name:** If a product name in the database contains HTML or script tags, the cart must sanitize the output and not execute injected code.

### Performance Risks
- **Large cart rendering:** A cart with 50+ unique products must render within 2 seconds. Quantity changes must update totals within 200ms.
- **Rapid quantity changes:** If a user clicks the "+" button rapidly 10 times, the final quantity should be current + 10 with no missed increments or race conditions. Only the final state should be synced to the server (debounced).

---

## Out of Scope

The following are explicitly NOT part of this feature's requirements and should not be tested:
- Product browsing and search
- User authentication and account management
- Checkout flow (payment, address, order confirmation)
- Order history
- Wishlist / save for later
- Product reviews and ratings
- Shipping address selection and delivery options
- Email notifications
