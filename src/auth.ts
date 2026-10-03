const ITERATIONS = 100_000;
const SESSION_DAYS = 30;

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	return out;
}

async function pbkdf2(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
	const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
	return crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, key, 256);
}

export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const hash = await pbkdf2(password, salt);
	return `pbkdf2$${ITERATIONS}$${toHex(salt.buffer)}$${toHex(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const [scheme, , saltHex, hashHex] = stored.split("$");
	if (scheme !== "pbkdf2" || !saltHex || !hashHex) return false;
	const hash = await pbkdf2(password, fromHex(saltHex));
	const a = new Uint8Array(hash);
	const b = fromHex(hashHex);
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
	return diff === 0;
}

export function newSessionToken(): string {
	return toHex(crypto.getRandomValues(new Uint8Array(32)).buffer);
}

export async function hashToken(token: string): Promise<string> {
	return toHex(await crypto.subtle.digest("SHA-256", enc.encode(token)));
}

export const SESSION_TTL_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

/** Normalise Ugandan phone numbers to +256XXXXXXXXX. Returns null if invalid. */
export function normalisePhone(input: string): string | null {
	const digits = input.replace(/[\s\-()]/g, "");
	let m: RegExpMatchArray | null;
	if ((m = digits.match(/^\+256(\d{9})$/))) return `+256${m[1]}`;
	if ((m = digits.match(/^256(\d{9})$/))) return `+256${m[1]}`;
	if ((m = digits.match(/^0(\d{9})$/))) return `+256${m[1]}`;
	return null;
}
