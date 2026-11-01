// End-to-end walkthrough: an iPad host and two phone players play a scene through to
// the recap against a running `sf dev` (uses the dev-only ?guest=<name> identities).
// Run: npm run dev > /tmp/dev.log &  then: node tests/e2e.cjs /tmp/dev.log  (screens land in tests/shots/)
const { chromium } = require("playwright");
const fs = require("fs");
const OUT = __dirname + "/shots"; fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT);
const cap = fs.readFileSync(process.argv[2], "utf8").match(/Open this private URL: (\S+)/)[1];
const BASE = new URL(cap).origin;
let n = 0;
const shot = async (p, name, full = false) => { n++; await p.screenshot({ path: `${OUT}/${String(n).padStart(2, "0")}-${name}.png`, fullPage: full }); };
let taps = 0; const tap = async (loc) => { taps++; await loc.click(); };
async function ctx(b, vp, name) {
  const c = await b.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: vp.width < 500 });
  const p = await c.newPage(); p.G = "?guest=" + name;
  p.on("pageerror", (e) => console.log(`[${name} pageerror]`, e.message));
  await p.goto(cap); await p.waitForTimeout(1200); return p;
}
(async () => {
  const b = await chromium.launch();
  const ipad = await ctx(b, { width: 1180, height: 820 }, "ipad");
  const ana = await ctx(b, { width: 390, height: 844 }, "ana");
  const ben = await ctx(b, { width: 390, height: 844 }, "ben");

  await ana.goto(BASE + "/" + ana.G); await ana.waitForTimeout(800); await shot(ana, "phone-home-first-visit");
  await ipad.goto(BASE + "/host" + ipad.G); await ipad.waitForTimeout(500);
  await ipad.getByRole("button", { name: "Open the table" }).click(); await ipad.waitForURL(/\/table\//);
  const code = ipad.url().split("/table/")[1].slice(0, 4); await ipad.waitForTimeout(600); await shot(ipad, "lobby-empty");

  // Ana scans the QR code
  taps = 0; let t = Date.now();
  await ana.goto(`${BASE}/join/${code}${ana.G}`); await ana.waitForTimeout(800); await shot(ana, "join-via-qr");
  await tap(ana.getByRole("button", { name: /^Kestrel/ })); await ana.waitForTimeout(300); await shot(ana, "join-pregen-picked");
  await tap(ana.getByRole("button", { name: /Play as Kestrel/ })); await ana.waitForURL(/\/play\//);
  console.log(`QR -> seated: ${taps} taps, ${((Date.now() - t) / 1000).toFixed(1)}s`);
  await ana.waitForTimeout(800); await shot(ana, "phone-lobby");

  // Ben types the code
  taps = 0;
  await ben.goto(BASE + "/join" + ben.G); await ben.locator("#code").fill(code); taps++;
  await tap(ben.getByRole("button", { name: "Find the table" })); await ben.waitForTimeout(800);
  await tap(ben.getByRole("button", { name: /^Moss/ })); await tap(ben.getByRole("button", { name: /Play as Moss/ })); await ben.waitForURL(/\/play\//);
  console.log(`Code -> seated: ${taps} taps`);
  await ipad.waitForTimeout(1500); await shot(ipad, "lobby-full");

  await ipad.getByRole("button", { name: "Begin the adventure" }).click(); await ipad.waitForTimeout(900);
  await shot(ipad, "scene-moment-start");
  await ipad.waitForTimeout(4500); await shot(ipad, "table-opening");
  await ana.waitForTimeout(1500); await shot(ana, "phone-choices", true);

  // Beat 1: Ana takes a risky option; Ben helps her
  await ana.getByRole("button", { name: /Dive in after the sailors/ }).click(); await ana.waitForTimeout(700);
  await shot(ana, "phone-locked"); await shot(ipad, "table-one-ready");
  await ben.getByRole("button", { name: /Help Kestrel/ }).click();
  await ana.getByRole("button", { name: "d20" }).waitFor({ timeout: 30000 }); await ana.waitForTimeout(500);
  await shot(ana, "phone-roll-stakes"); await shot(ben, "phone-others-rolling"); await shot(ipad, "table-rolling");
  await ana.getByRole("button", { name: "d20" }).click(); await ipad.waitForTimeout(700); await shot(ipad, "dice-moment");
  await shot(ana, "phone-roll-result");
  await ana.locator("#action").waitFor({ timeout: 30000 }); await ipad.waitForTimeout(1500);
  await shot(ipad, "table-after-beat1"); await shot(ana, "phone-after-beat1", true);

  // Beat 2: Ana free text + ability; Ben takes a safe option
  await ana.getByRole("button", { name: /^Vanish/ }).click();
  await ana.locator("#action").fill("I slip through the crowd toward the preacher.");
  await ana.getByRole("button", { name: "Lock it in" }).click();
  await ben.getByRole("button", { name: /Find out who saw what/ }).click();
  await ana.getByRole("button", { name: "d20" }).waitFor({ timeout: 30000 });
  await ana.getByRole("button", { name: "d20" }).click();
  await ana.locator("#action").waitFor({ timeout: 30000 }); await ipad.waitForTimeout(1500);
  await shot(ipad, "table-after-beat2"); await shot(ana, "phone-after-beat2", true);

  // Beat 3: both hold-ish -> no rolls -> scene ends (backup: 3 beats)
  await ana.getByRole("button", { name: /Calm the panicking crowd/ }).click();
  await ben.getByRole("button", { name: "Hold back" }).click();
  await ana.getByRole("button", { name: "d20" }).waitFor({ timeout: 30000 }); await ana.getByRole("button", { name: "d20" }).click();
  await ipad.getByText("Scene 2 of 3").waitFor({ timeout: 20000 }); await shot(ipad, "scene-moment-2");
  await ipad.waitForTimeout(5000); await shot(ipad, "table-scene-2");
  await ana.waitForTimeout(500); await shot(ana, "phone-sheet-before"); await ana.getByRole("button", { name: "Sheet" }).click(); await shot(ana, "phone-sheet", true);
  await ana.getByRole("button", { name: "Play" }).click();

  // End
  await ipad.locator("summary").click(); await shot(ipad, "host-menu");
  await ipad.getByRole("button", { name: "End the game" }).click(); await ipad.getByRole("button", { name: /Yes, end it/ }).click();
  await ipad.waitForTimeout(2000); await shot(ipad, "recap"); await ana.waitForTimeout(1500); await shot(ana, "phone-ended");
  await ana.goto(BASE + "/" + ana.G); await ana.waitForTimeout(600); await shot(ana, "phone-home-returning");
  console.log("SHOTS", n);
  await b.close();
})().catch((e) => { console.error("FAIL", e.message.split("\n")[0]); process.exit(1); });
