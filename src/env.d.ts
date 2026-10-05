interface Env {
	DATABASE_URL: string;
	PESAPAL_CONSUMER_KEY: string;
	PESAPAL_CONSUMER_SECRET: string;
	PESAPAL_ENV?: string; // "live" or unset/anything else = sandbox
	UGATEXT_CLIENT_ID: string;
	UGATEXT_CLIENT_SECRET: string;
}
