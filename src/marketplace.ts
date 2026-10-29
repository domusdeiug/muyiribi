// TypeScript port of marketplace_mcp/adapters/jiji.py and tools.search_marketplace.
// Only Jiji's public, anonymous listing endpoint is used. Contact reveal stays on Jiji.
const BASE_URL = "https://jiji.ug";
const SEARCH_URL = `${BASE_URL}/api_web/v1/listing`;
const NOTE = "Listings were ranked by complete title phrase matches, not by the user's full stated needs — check attrs/condition/price before presenting.";
const TTL_SECONDS = 20 * 60;

type Advert = Record<string, unknown>;

export type SearchParams = {
	query: string;
	synonyms?: string[];
	min_price?: number;
	max_price?: number;
	region?: string;
	sort?: "rel" | "new" | "price" | "price_desc";
	page?: number;
	target_results?: number;
	max_fetch_pages?: number;
	min_relevance_score?: number;
	source?: string;
};

export type Product = {
	id: string;
	title: string;
	price: string;
	condition?: string;
	attrs?: Record<string, string>;
	image?: string;
	image_count: number;
	listing_url?: string;
	region?: string;
	seller?: string;
	seller_rating?: number;
};

type Listing = Product & { price_amount?: number };
export type SearchResult = {
	source: string;
	query: string;
	count: number;
	listings: Product[];
	cached: boolean;
	note: string;
};

function obj(value: unknown): Advert {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Advert : {};
}
function text(value: unknown): string | undefined {
	return typeof value === "string" && value ? value : undefined;
}
function array(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function tokens(value: string): string[] {
	return (value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).map((word) => {
		if (word.length > 4 && word.endsWith("ies")) return word.slice(0, -3) + "y";
		if (word.length > 4 && word.endsWith("es") && /(?:ss|sh|ch|x)$/.test(word.slice(0, -2))) return word.slice(0, -2);
		if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
		return word;
	});
}

export function scoreRelevance(title: string, query: string, synonyms: string[]): number {
	const titleWords = tokens(title);
	const queryWords = tokens(query);
	if (!titleWords.length || !queryWords.length) return 0;
	if (queryWords.some((word) => /^\d+$/.test(word) && !titleWords.includes(word))) return 0;
	let best = 0;
	for (const phrase of [query, ...synonyms]) {
		const words = tokens(phrase);
		if (!words.length) continue;
		const n = words.length;
		let contiguous = false;
		let reversedPair = false;
		for (let i = 0; i + n <= titleWords.length; i++) {
			if (words.every((word, j) => word === titleWords[i + j])) contiguous = true;
			if (n === 2 && titleWords[i] === words[1] && titleWords[i + 1] === words[0]) reversedPair = true;
		}
		if (contiguous || reversedPair) {
			best = Math.max(best, n + Number(contiguous && words.join("\0") === queryWords.join("\0")));
		}
	}
	return best;
}

export function normalizeAdvert(raw: Advert): Listing | null {
	const guid = raw.guid || raw.id;
	if (!guid) return null;
	const price = obj(raw.price_obj);
	const attrs: Record<string, string> = {};
	for (const entry of array(raw.attrs)) {
		const attr = obj(entry);
		if (typeof attr.name === "string" && attr.name && attr.value != null) attrs[attr.name] = String(attr.value);
	}
	const images = array(raw.images).map((img) => text(obj(img).url)).filter((url): url is string => !!url);
	if (!images.length) {
		const fallback = text(obj(raw.image_obj).url);
		if (fallback) images.push(fallback);
	}
	let listingUrl = text(raw.url) ?? "";
	if (listingUrl.startsWith("/")) listingUrl = BASE_URL + listingUrl;
	listingUrl = listingUrl.split("?")[0];
	const seller = obj(raw.seller);
	const amount = typeof price.value === "number" ? price.value : undefined;
	const display = text(price.view) ?? text(raw.price_title);
	return {
		id: `jiji:${String(guid)}`,
		title: (text(raw.title) ?? "").trim(),
		price: display ?? (amount ? `${amount} UGX` : "Price not listed"),
		...(attrs.Condition ? { condition: attrs.Condition } : {}),
		...(Object.keys(attrs).length ? { attrs } : {}),
		...(images[0] ? { image: images[0] } : {}),
		image_count: images.length,
		...(listingUrl ? { listing_url: listingUrl } : {}),
		...(text(raw.region) || text(raw.region_item_text) ? { region: text(raw.region) ?? text(raw.region_item_text) } : {}),
		...(text(seller.user_name) ? { seller: text(seller.user_name) } : {}),
		...(typeof seller.user_rating === "number" ? { seller_rating: seller.user_rating } : {}),
		...(amount !== undefined ? { price_amount: amount } : {}),
	};
}

const JIJI_FETCH_HEADERS = {
	accept: "*/*",
	"accept-language": "en-US,en;q=0.7",
	"user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36",
	"sec-fetch-dest": "empty", "sec-fetch-mode": "cors", "sec-fetch-site": "same-origin",
	cookie: "rid=jiji.ug; lang=en",
};

// Log only request position and a few diagnostic response headers. Never log the
// query, full URL, response body or user-supplied filters in Worker tail logs.
async function requestJiji(url: string, phase: "search" | "category-redirect", page: number, sort: string, request: typeof fetch): Promise<Response> {
	let response: Response;
	try {
		response = await request(url, {
			headers: JIJI_FETCH_HEADERS,
			signal: AbortSignal.timeout(10_000),
		});
	} catch (error) {
		console.error("Marketplace upstream request failed", {
			phase, page, sort, errorType: error instanceof Error ? error.name : "unknown",
		});
		throw new Error("Marketplace upstream request failed");
	}
	if (!response.ok) {
		console.error("Marketplace upstream HTTP error", {
			phase, page, sort, status: response.status,
			cfRay: response.headers.get("cf-ray"),
			cfMitigated: response.headers.get("cf-mitigated"),
			retryAfter: response.headers.get("retry-after"),
			server: response.headers.get("server"),
			contentType: response.headers.get("content-type"),
		});
		throw new Error(`Jiji ${phase} returned HTTP ${response.status}`);
	}
	return response;
}

async function fetchPage(params: Required<SearchParams>, sort: string, page: number, request: typeof fetch, allowRedirect = true): Promise<Advert[]> {
	const url = new URL(SEARCH_URL);
	url.search = new URLSearchParams({
		query: params.query, init_page: "true", page: String(page), webp: "true", sort,
		...(params.region ? { region: params.region } : {}),
	}).toString();
	const response = await requestJiji(url.toString(), "search", page, sort, request);
	const data = obj(await response.json());

	// For broad/popular queries Jiji doesn't return adverts_list at all: instead it
	// returns {status:"redirect", url:"/some-category?filter_attr_..."} pointing at a
	// category page. Previously this fell through to `array(obj(undefined).adverts)`
	// -> [] , which looked like (and got cached as) a genuine "zero results" response.
	// We now follow the redirect once by re-querying the same listing API with the
	// category's query-string filters merged in and the free-text query dropped,
	// mirroring what the category page itself would request.
	if (data.status === "redirect" && typeof data.url === "string") {
		if (!allowRedirect) throw new Error(`Jiji redirected again from ${data.url}; not following a second time`);
		const redirectUrl = new URL(data.url, BASE_URL);
		const redirectParams = new URLSearchParams({
			init_page: "true", page: String(page), webp: "true", sort,
			...(params.region ? { region: params.region } : {}),
		});
		for (const [key, value] of redirectUrl.searchParams) redirectParams.set(key, value);
		// NOTE: unverified — confirm Jiji's listing API accepts a bare category slug via
		// `slug`; if it instead needs the category id or a different param name, adjust here.
		redirectParams.set("slug", redirectUrl.pathname.replace(/^\//, ""));
		const redirectResponse = await requestJiji(`${SEARCH_URL}?${redirectParams.toString()}`, "category-redirect", page, sort, request);
		const redirectData = obj(await redirectResponse.json());
		if (!("adverts_list" in redirectData)) {
			throw new Error(`Jiji redirect to ${data.url} did not return adverts_list`);
		}
		return array(obj(redirectData.adverts_list).adverts).map(obj);
	}

	if (!("adverts_list" in data)) {
		// A 200 with valid JSON but no recognizable shape (e.g. a bot-check/placeholder
		// payload) is NOT the same as "zero results" -- surface it as an error so it is
		// never cached as an empty result.
		throw new Error("Jiji response did not contain adverts_list or a redirect");
	}
	return array(obj(data.adverts_list).adverts).map(obj);
}

function withinBudget(listing: Listing, params: Required<SearchParams>): boolean {
	return listing.price_amount === undefined ||
		(listing.price_amount >= params.min_price && listing.price_amount <= params.max_price);
}

export async function searchJiji(input: SearchParams, request: typeof fetch = fetch): Promise<Product[]> {
	const params = defaults(input);
	if (params.sort !== "rel" && params.sort !== "new") {
		const adverts = await fetchPage(params, params.sort, params.page, request);
		return adverts.map(normalizeAdvert).filter((l): l is Listing => !!l && withinBudget(l, params)).map(stripInternal);
	}
	if (params.target_results <= 0) return [];
	const candidates: Array<{ score: number; listing: Listing }> = [];
	const seen = new Set<string>();
	let reachedTarget = false;
	for (let offset = 0; offset < params.max_fetch_pages; offset++) {
		const adverts = await fetchPage(params, "new", params.page + offset, request);
		if (!adverts.length) break;
		for (const advert of adverts) {
			const listing = normalizeAdvert(advert);
			if (!listing || seen.has(listing.id)) continue;
			seen.add(listing.id);
			if (!withinBudget(listing, params)) continue;
			const score = scoreRelevance(listing.title, params.query, params.synonyms);
			if (score > 0 && score >= params.min_relevance_score) candidates.push({ score, listing });
		}
		if (candidates.length >= params.target_results) {
			if (reachedTarget) break;
			reachedTarget = true;
		} else reachedTarget = false;
	}
	candidates.sort((a, b) => b.score - a.score); // stable sort: newest wins ties
	return candidates.slice(0, params.target_results).map(({ listing }) => stripInternal(listing));
}

function stripInternal({ price_amount: _amount, ...product }: Listing): Product {
	return product;
}

function defaults(input: SearchParams): Required<SearchParams> {
	return {
		query: input.query, synonyms: input.synonyms ?? [], min_price: input.min_price ?? -Infinity,
		max_price: input.max_price ?? Infinity, region: input.region ?? "", sort: input.sort ?? "rel",
		page: input.page ?? 1, target_results: input.target_results ?? 15,
		max_fetch_pages: input.max_fetch_pages ?? 6, min_relevance_score: input.min_relevance_score ?? 1,
		source: input.source ?? "jiji",
	};
}

// Cloudflare Cache API persists across Worker invocations at a given colo.
// Cache failures are non-fatal; don't cache upstream errors as empty results.
async function cacheRequest(params: SearchParams): Promise<Request> {
	const key = JSON.stringify({
		query: params.query.trim().toLowerCase(), synonyms: [...(params.synonyms ?? [])].map(s => s.trim().toLowerCase()).sort(),
		min_price: params.min_price ?? null, max_price: params.max_price ?? null, region: params.region ?? null,
		sort: params.sort ?? "rel", page: params.page ?? 1, target_results: params.target_results ?? 15,
		max_fetch_pages: params.max_fetch_pages ?? 6, min_relevance_score: params.min_relevance_score ?? 1,
		source: params.source ?? "jiji",
	});
	const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
	const hex = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
	return new Request(`https://marketplace-cache.internal/${hex}`);
}

export async function searchMarketplace(input: SearchParams, request: typeof fetch = fetch, cache?: Cache): Promise<SearchResult | { error: string; source: string; listings: [] }> {
	const source = input.source ?? "jiji";
	if (source !== "jiji") return { error: `Unknown marketplace source '${source}'. Available: ['jiji']`, source, listings: [] };
	let key: Request | undefined;
	try {
		key = await cacheRequest(input);
		const cached = await cache?.match(key);
		if (cached) {
			const listings = await cached.json() as Product[];
			return { source, query: input.query, count: listings.length, listings, cached: true, note: NOTE };
		}
	} catch (error) { console.warn("Marketplace cache read failed", error); }
	try {
		const listings = await searchJiji(input, request);
		if (cache && key) {
			try {
				await cache.put(key, new Response(JSON.stringify(listings), {
					headers: { "cache-control": `public, max-age=${TTL_SECONDS}`, "content-type": "application/json" },
				}));
			} catch (error) { console.warn("Marketplace cache write failed", error); }
		}
		return { source, query: input.query, count: listings.length, listings, cached: false, note: NOTE };
	} catch (error) {
		console.error("Jiji marketplace search failed", error);
		return { error: "Jiji marketplace search is temporarily unavailable", source, listings: [] };
	}
}