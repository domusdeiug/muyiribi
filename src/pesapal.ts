// PesaPal API 3.0 (JSON) client for Cloudflare Workers.
//
// Flow: SubmitOrderRequest returns a redirect_url for PesaPal's hosted checkout. We send
// the user to that URL directly (full page navigation). PesaPal redirects the full browser
// tab back to /pricing/callback after payment, which then resolves to /pricing/status.
// The phone number (or email) the user registered with is pre-filled on PesaPal's page;
// the user can still change the mobile money number used to pay there.
//
// Status is only trusted from GetTransactionStatus. The callback and IPN parameters do not
// carry the payment status (PesaPal docs: "for security reasons").
//
// Requires PESAPAL_CONSUMER_KEY / PESAPAL_CONSUMER_SECRET as Worker secrets, and optionally
// PESAPAL_ENV = "live" (defaults to sandbox).

function pesapalBase(env: Env): string {
	return env.PESAPAL_ENV === "live"
		? "https://pay.pesapal.com/v3"
		: "https://cybqa.pesapal.com/pesapalv3";
}

// ---------- token cache ----------
// PesaPal tokens expire after about 5 minutes. We keep one for 4 minutes per isolate so
// polling does not request a new token on every call. Module scope is per isolate, so this
// is a best-effort cache, not a guarantee; a stale token is simply refreshed.

const TOKEN_TTL_MS = 4 * 60 * 1000;
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getPesapalToken(env: Env): Promise<string> {
	if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;

	const res = await fetch(`${pesapalBase(env)}/api/Auth/RequestToken`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Accept: "application/json" },
		body: JSON.stringify({
			consumer_key: env.PESAPAL_CONSUMER_KEY,
			consumer_secret: env.PESAPAL_CONSUMER_SECRET,
		}),
	});
	const json = (await res.json()) as Record<string, unknown>;
	if (!json.token) throw new Error(`PesaPal auth failed: ${JSON.stringify(json)}`);

	cachedToken = { token: json.token as string, expiresAt: Date.now() + TOKEN_TTL_MS };
	return cachedToken.token;
}

async function registerIpn(env: Env, token: string, ipnUrl: string): Promise<string> {
	const res = await fetch(`${pesapalBase(env)}/api/URLSetup/RegisterIPN`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify({ url: ipnUrl, ipn_notification_type: "GET" }),
	});
	const json = (await res.json()) as Record<string, unknown>;
	if (!json.ipn_id)
		throw new Error(`Failed to register PesaPal IPN URL: ${JSON.stringify(json)}`);
	return json.ipn_id as string;
}

export interface PesapalOrder {
	order_tracking_id: string;
	redirect_url: string;
}

/**
 * Creates a PesaPal order and returns the hosted checkout URL to redirect the user to.
 * `workerBaseUrl` is the Worker's own origin, used to build the callback and IPN URLs.
 * `callbackPath` is where PesaPal sends the user after payment (our status page).
 */
export async function submitVerificationOrder(
	env: Env,
	workerBaseUrl: string,
	opts: {
		merchantRef: string;
		amountUgx: number;
		description: string;
		phone?: string | null;
		email?: string | null;
	},
): Promise<PesapalOrder> {
	const token = await getPesapalToken(env);
	const ipnUrl = `${workerBaseUrl}/payments/pesapal-ipn`;
	const callbackUrl = `${workerBaseUrl}/pricing/callback`;
	const ipnId = await registerIpn(env, token, ipnUrl);

	const res = await fetch(`${pesapalBase(env)}/api/Transactions/SubmitOrderRequest`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify({
			id: opts.merchantRef,
			currency: "UGX",
			amount: opts.amountUgx,
			description: opts.description,
			callback_url: callbackUrl,
			// TOP_WINDOW: after payment PesaPal redirects the full browser tab back to
			// the callback URL. No iframe involved.
			redirect_mode: "TOP_WINDOW",
			notification_id: ipnId,
			branch: "Muyiribi",
			// PesaPal requires phone_number OR email_address in billing_address. We send the
			// number (or email) the user registered with, so it's pre-filled on PesaPal's
			// checkout; the user can still pick a different mobile money number there.
			billing_address: {
				country_code: "UG",
				...(opts.phone ? { phone_number: opts.phone } : {}),
				...(opts.email ? { email_address: opts.email } : {}),
			},
		}),
	});

	const json = (await res.json()) as Record<string, unknown>;
	if (!json.order_tracking_id)
		throw new Error(`PesaPal did not return an order: ${JSON.stringify(json)}`);
	return {
		order_tracking_id: json.order_tracking_id as string,
		redirect_url: (json.redirect_url as string) ?? "",
	};
}

export interface PesapalTransactionStatus {
	status: string; // normalised uppercase, e.g. "COMPLETED", "FAILED", "INVALID", "PENDING"
}

export async function getPesapalTransactionStatus(
	env: Env,
	orderTrackingId: string,
): Promise<PesapalTransactionStatus> {
	const token = await getPesapalToken(env);
	const res = await fetch(
		`${pesapalBase(env)}/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`,
		{
			headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
		},
	);
	const json = (await res.json()) as Record<string, unknown>;
	return { status: String(json.payment_status_description ?? "UNKNOWN").toUpperCase() };
}

export function isCompletedStatus(status: string): boolean {
	return status === "COMPLETED" || status === "SUCCESS";
}