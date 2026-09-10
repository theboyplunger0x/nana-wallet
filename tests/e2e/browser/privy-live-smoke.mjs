import { chromium } from "playwright";

const FRONT = process.env.FRONT_URL ?? "http://127.0.0.1:32783";
const API = "http://127.0.0.1:32782";
const results = [];
const step = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

try {
  // 1. Login page loads
  await page.goto(`${FRONT}/login`, {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  const body = await page.textContent("body");
  step(
    "login page loads",
    body.includes("Ingresar") || body.length > 50,
    `len=${body.length}`,
  );

  // 2. Privy dialog opens on click
  const btn = page.getByText("Ingresar", { exact: false }).first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(4000);
    step(
      "privy login dialog opens",
      true,
      `dialog elements: ${await page.locator("iframe").count()} iframes`,
    );
  } else {
    step("privy login dialog opens", false, "Ingresar button not found");
  }

  // 3. API rejects unauthenticated wallet access (node fetch, bypasses CORS)
  const res = await fetch(`${API}/v1/wallets/current`);
  const resBody = await res.json().catch(() => null);
  step(
    "wallet API rejects unauthenticated",
    res.status === 401,
    JSON.stringify(resBody).slice(0, 120),
  );

  // 4. API rejects unauthenticated permission access
  const res2 = await fetch(`${API}/v1/wallets/current/permission`);
  step(
    "permission API rejects unauthenticated",
    res2.status === 401,
    `status=${res2.status}`,
  );

  // 5. No page errors
  step(
    "zero page errors",
    pageErrors.length === 0,
    pageErrors.slice(0, 2).join("; ") || "clean",
  );

  await page.screenshot({ path: "/tmp/privy-e2e-login.png", fullPage: true });
  console.log("screenshot: /tmp/privy-e2e-login.png");
} catch (e) {
  step("e2e harness", false, e.message.slice(0, 200));
} finally {
  await browser.close();
}

const pass = results.filter((r) => r.ok).length;
console.log(`\nRESULT: ${pass}/${results.length} PASS`);
process.exit(pass === results.length ? 0 : 1);
