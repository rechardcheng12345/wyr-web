// Business settings that are the same in every environment. Change them here, not in .env.
// Values that differ per environment or are secret (PORT, DB_*, PUBLIC_BASE_URL, PAYMENT_MODE,
// TOYYIBPAY_*) stay in server/.env / environment variables.

/** Browser origins allowed to call the API cross-origin (only the Vite dev server; production is same-origin). */
export const CORS_ORIGINS = ["http://localhost:5173"];

/** Flat shipping in RM: Peninsular Malaysia, and East Malaysia (Sabah, Sarawak, Labuan). */
export const SHIPPING_FLAT_WM_RM = 8;
export const SHIPPING_FLAT_EM_RM = 15;

/** How long an unpaid order holds its stock, in minutes. */
export const ORDER_HOLD_MINUTES = 30;

/** WhatsApp number for "Bulk / business quote" links: digits with country code, no + or spaces. PLACEHOLDER: replace with the real business number. */
export const WHATSAPP_NUMBER = "60123456789";

/** ToyyibPay payment channel: "0" = FPX only, "1" = card only, "2" = both (card must be enabled on the account). */
export const TOYYIBPAY_PAYMENT_CHANNEL = "0";
