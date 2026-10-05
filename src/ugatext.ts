// Thin wrapper around the UgaText REST API (https://ugatext.com/api/v1/sms/send).
// Requires UGATEXT_CLIENT_ID / UGATEXT_CLIENT_SECRET as Worker secrets.

export interface SendSmsResult {
	success: boolean;
	message_id?: string;
	status?: string;
	cost_ugx?: number;
	error?: string;
}

// UgaText expects "256700000000" (no leading +). normalisePhone() elsewhere in this
// app produces "+256700000000", so strip the plus before sending.
function toUgatextPhone(phone: string): string {
	return phone.replace(/^\+/, "");
}

export async function sendSms(env: Env, phone: string, message: string): Promise<SendSmsResult> {
	try {
		const res = await fetch("https://ugatext.com/api/v1/sms/send", {
			method: "POST",
			headers: {
				"Client-ID": env.UGATEXT_CLIENT_ID,
				"Client-Secret": env.UGATEXT_CLIENT_SECRET,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ phone: toUgatextPhone(phone), senderId: "UGATEXT", message }),
		});

		const json = (await res.json()) as Record<string, unknown>;
		if (!res.ok || json.success !== true) {
			return {
				success: false,
				error: typeof json.error === "string" ? json.error : `HTTP ${res.status}`,
			};
		}
		return {
			success: true,
			message_id: json.message_id as string | undefined,
			status: json.status as string | undefined,
			cost_ugx: json.cost_ugx as number | undefined,
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : "Unknown error sending SMS",
		};
	}
}
