// End-to-end smoke test: an iPad host and two phone players play one full beat
// against a running `sf dev` (uses the dev-only ?guest=<name> identities).
// Run: npm run dev > /tmp/dev.log & ; node tests/e2e.cjs /tmp/dev.log
const { chromium } = require("playwright");
const fs = require("fs");
const OUT = process.env.SHOTS_DIR || require("path").join(require("os").tmpdir(), "wakefield-shots");
fs.mkdirSync(OUT, { recursive: true });
// Usage: node tests/e2e.cjs <path to a file containing sf dev output>
const log = fs.readFileSync(process.argv[2] || "/dev/stdin", "utf8");
const cap = log.match(/Open this private URL: (\S+)/)[1];
const BASE = new URL(cap).origin;

async function ctxFor(browser, viewport, name) {
  const G = "?guest=" + name;
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[${name} pageerror]`, e.message));
  page.on("console", (m) => { if (m.type() === "error") console.log(`[${name} console]`, m.text()); });
  await page.goto(cap);
  await page.waitForTimeout(1500);
  page.G = G;
  return page;
}
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png`, fullPage: false });

async function makeCharacter(p, code, handle, origin, variant, calling, bg, name) {
  await p.goto(`${BASE}/join/${code}${p.G}`);
  await p.getByPlaceholder("Your name").fill(handle);
  await p.getByRole("button", { name: "Save" }).click();
  await p.getByText("+ Create a new character").click();
  await p.getByRole("button", { name: new RegExp("^" + origin) }).click();
  if (variant) await p.getByText(variant, { exact: true }).click();
  await p.getByRole("button", { name: "Next" }).click();
  await p.getByRole("button", { name: new RegExp("^" + calling) }).click();
  await p.getByRole("button", { name: "Next" }).click();
  await p.getByRole("button", { name: new RegExp("^" + bg) }).click();
  await p.getByRole("button", { name: "Next" }).click();
  await p.getByRole("button", { name: "Next" }).click();
  await p.getByPlaceholder(/Kestrel/).fill(name);
  await p.getByRole("button", { name: /Protect my neighborhood/ }).click();
  await p.getByRole("button", { name: "Next" }).click();
  await shot(p, `review-${name}`);
  await p.getByRole("button", { name: new RegExp("Create " + name) }).click();
  await p.waitForURL(new RegExp(`/join/${code}`));
  await p.getByText(name).first().click();
  await p.getByRole("button", { name: "Take a seat" }).click();
  await p.waitForURL(new RegExp(`/play/${code}`));
}

(async () => {
  const browser = await chromium.launch();
  const host = await ctxFor(browser, { width: 1180, height: 820 }, "host");
  await host.goto(BASE + "/" + host.G);
  await host.waitForTimeout(1000);
  await shot(host, "01-home");
  await host.goto(BASE + "/host" + host.G);
  await host.getByPlaceholder("Friday Night Tide").fill("Friday Night Tide");
  await host.getByRole("button", { name: "Open the table" }).click();
  await host.waitForURL(/\/table\//);
  const code = host.url().split("/table/")[1].slice(0,4);
  console.log("code", code);
  await host.waitForTimeout(800);
  await shot(host, "02-lobby-empty");

  const p1 = await ctxFor(browser, { width: 390, height: 844 }, "p1");
  const p2 = await ctxFor(browser, { width: 390, height: 844 }, "p2");
  await makeCharacter(p1, code, "Ana", "Uplift", "Corvid", "Ghost", "Rustline Scrapper", "Kestrel");
  await makeCharacter(p2, code, "Ben", "Woken", null, "Splicer", "Deep Diver", "Unit Nine");
  await host.waitForTimeout(800);
  await shot(host, "03-lobby-full");
  await shot(p1, "04-phone-lobby");

  await host.getByRole("button", { name: "Begin the adventure" }).click();
  await host.waitForTimeout(1500);
  await shot(host, "05-table-opening");
  await shot(p1, "06-phone-action");

  await p1.locator("#action").fill("I dive in after the sailor and haul him to the barge.");
  await p1.getByRole("button", { name: "Lock it in" }).click();
  await host.waitForTimeout(800);
  await shot(host, "07-table-one-ready");
  await p2.locator("#action").fill("I listen on Beacon's channels to hear what's wrong.");
  await p2.getByRole("button", { name: "Lock it in" }).click();
  await host.waitForTimeout(5000);
  await shot(host, "08-table-rolls");
  await shot(p1, "09-phone-roll");
  await p1.getByRole("button", { name: "d20" }).click();
  await host.waitForTimeout(700);
  await shot(host, "10-dice-overlay");
  await p2.getByRole("button", { name: "d20" }).click();
  await host.waitForTimeout(6000);
  await shot(host, "11-table-outcome");
  await shot(p2, "12-phone-after");
  await p2.getByRole("button", { name: "Sheet" }).click();
  await shot(p2, "13-phone-sheet");
  await p2.getByRole("button", { name: "Story" }).click();
  await p2.waitForTimeout(500);
  await shot(p2, "14-phone-story");
  const footer = await host.locator("footer").innerText();
  console.log("FOOTER:", footer.replace(/\n/g, " | "));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
