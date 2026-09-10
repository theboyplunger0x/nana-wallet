/**
 * Read-only live smoke: GET /v1/wallets against the real Privy API.
 * Run through vault-env so credentials never pass through the agent context:
 *   vault-env run --names PRIVY_APP_ID,PRIVY_APP_SECRET -- npx tsx scripts/privy-live-smoke.mjs
 * Prints only names/counts/status — never secret values.
 */
const base = (
 process.env.PRIVY_API_BASE_URL ?? "https://api.privy.io/v1"
).replace(/\/$/, "");
const appId = process.env.PRIVY_APP_ID?.trim();
const appSecret = process.env.PRIVY_APP_SECRET?.trim();
if (!appId || !appSecret) {
 console.error(
  "BLOCKED: PRIVY_APP_ID / PRIVY_APP_SECRET missing in the injected environment.",
 );
 process.exit(2);
}
const basic = Buffer.from(`${appId}:${appSecret}`).toString("base64");
const response = await fetch(`${base}/wallets`, {
 method: "GET",
 headers: { "privy-app-id": appId, Authorization: `Basic ${basic}` },
});
console.log("GET /v1/wallets →", response.status);
const body = await response.json().catch(() => null);
const wallets = Array.isArray(body?.data) ? body.data : null;
console.log("wallets returned:", wallets ? wallets.length : "unexpected shape");
if (response.status !== 200 || wallets === null) {
 // Surface the provider error shape without echoing any credential material.
 const err = body?.error;
 console.log(
  "provider error code:",
  typeof err === "object" ? (err?.code ?? "n/a") : (err ?? "n/a"),
 );
 if (typeof err === "object" && typeof err?.message === "string") {
  // Scrub any basic-auth-looking substring defensively before printing.
  console.log(
   "provider error message:",
   err.message.replace(/[A-Za-z0-9+/=]{40,}/g, "<redacted-long-token>"),
  );
 }
 process.exit(1);
}
console.log("SMOKE RESULT: PASS (read-only list; zero mutations performed)");
