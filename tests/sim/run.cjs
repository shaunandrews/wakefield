// Watchable simulation: an iPad table and phone players side by side in one window,
// played by bots at human pace so you can watch the UX. Starts its own `sf dev` with fresh state.
// Run: npm run sim                         (3 phone players + 1 in the VR room)
//      npm run sim -- --players ana,ben     (pick the phone players)
//      npm run sim -- --vr dee,eli          (pick the headset players; --vr none for phones only)
//      npm run sim -- --speed 2             (faster bots)
//      npm run sim -- --manual              (no bots: tap the screens yourself)
//      npm run sim -- --headless            (no window; the log prints here, screenshots go to a temp folder)
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf("--" + name);
  return i === -1 ? fallback : process.argv[i + 1];
};
const names = (v) => (v === "none" ? [] : v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
const PLAYERS = names(arg("players", "ana,ben,cy"));
const HEADSETS = names(arg("vr", "dee"));
const SPEED = Number(arg("speed", "1")) || 1;
const MANUAL = process.argv.includes("--manual");
const HEADLESS = process.argv.includes("--headless");
// Outside the project: sf dev reloads on file changes, which would wipe the game mid-run.
const SHOTS = arg("shots", path.join(os.tmpdir(), "wakefield-sim"));
const DEV_PORT = Number(arg("dev-port", "3168"));
const STAGE_PORT = Number(arg("stage-port", "3167"));
const PREGENS = ["Kestrel", "Moss", "Unit Nine", "Maro-Jun", "Sable Okoro", "Ada Vance"];
const FREE_TEXT = [
  "I keep low and watch the water for movement.",
  "I ask the nearest dockhand what they saw.",
  "I climb onto the crane for a better view.",
  "I try to talk them down before anyone gets hurt.",
  "I check the hull for marks left by whatever did this.",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms / SPEED));
const think = () => sleep(1500 + Math.random() * 2500);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
let done = false;

function startDev() {
  return new Promise((resolve, reject) => {
    const proc = spawn("sf", ["dev", "--state-backend", "memory", "--port", String(DEV_PORT)], { cwd: ROOT });
    let out = "";
    const onData = (chunk) => {
      out += chunk;
      const m = out.match(/Open this private URL: (\S+)/);
      if (m) resolve({ proc, capability: m[1] });
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", (c) => process.stderr.write(c));
    proc.on("exit", (code) => reject(new Error(`sf dev exited (${code}):\n${out}`)));
  });
}

function startStage() {
  const html = fs.readFileSync(path.join(__dirname, "stage.html"));
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  });
  return new Promise((resolve) => server.listen(STAGE_PORT, "127.0.0.1", () => resolve(server)));
}

async function waitForFrameUrl(page, name, pattern, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const f = page.frame({ name });
    if (f && pattern.test(f.url())) return f.url();
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${name} never reached ${pattern}`);
}

async function visible(locator) {
  try {
    return (await locator.count()) > 0 && (await locator.first().isVisible()) && (await locator.first().isEnabled());
  } catch {
    return false;
  }
}

async function host(page, sim) {
  const table = page.frameLocator('iframe[name="table"]');
  await table.getByRole("button", { name: "Open the table" }).waitFor({ timeout: 30000 });
  await think();
  sim("log", "table", "Opens a new table.");
  await table.getByRole("button", { name: "Open the table" }).click();
  const code = (await waitForFrameUrl(page, "table", /\/table\//)).split("/table/")[1].slice(0, 4);
  sim("log", "table", `Table is open. Join code ${code}.`);
  sim("tag", "table", code);
  return code;
}

async function join(page, sim, name, code, pregen, vr = false) {
  sim("focus", name);
  sim("log", name, `Joins with code ${code}.`);
  await page.evaluate(([n, c]) => window.sim.go(n, `/join/${c}`), [name, code]);
  const phone = page.frameLocator(`iframe[name="${name}"]`);
  const card = phone.getByRole("button", { name: new RegExp("^" + pregen) });
  await card.waitFor({ timeout: 30000 });
  await think();
  await card.click();
  await sleep(800);
  await phone.getByRole("button", { name: `Play as ${pregen}` }).click();
  await waitForFrameUrl(page, name, /\/play\//);
  // In-app navigation drops ?guest=, and later live refreshes would come back as nobody. Reload with it.
  await page.evaluate(([n, c, path]) => window.sim.go(n, `/${path}/${c}`), [name, code, vr ? "vr" : "play"]);
  sim("log", name, vr ? `Sits down as ${pregen} and puts on the headset.` : `Sits down as ${pregen}.`);
  sim("tag", name, pregen);
}

async function play(page, sim, name) {
  const phone = page.frameLocator(`iframe[name="${name}"]`);
  while (!done) {
    await sleep(800);
    try {
      const d20 = phone.getByRole("button", { name: "d20" });
      if (await visible(d20)) {
        await think();
        sim("focus", name);
        sim("log", name, "Rolls the d20.");
        await d20.click();
        await d20.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
        continue;
      }
      if (!(await visible(phone.locator("#action")))) continue;

      await think();
      sim("focus", name);
      const abilities = phone.locator("button[title]:not([disabled])");
      if ((await abilities.count()) > 0 && Math.random() < 0.2) {
        const a = abilities.nth(Math.floor(Math.random() * (await abilities.count())));
        sim("log", name, `Adds ${(await a.innerText()).split(" · ")[0]}.`);
        await a.click();
        await sleep(600);
      }
      const options = phone.locator("button:has(> span.wf-read)");
      const helps = phone.getByRole("button", { name: /^Help / });
      const r = Math.random();
      if (r < 0.6 && (await options.count()) > 0) {
        const o = options.nth(Math.floor(Math.random() * (await options.count())));
        sim("log", name, `“${await o.locator("span.wf-read").innerText()}”`);
        await o.click();
      } else if (r < 0.75 && (await helps.count()) > 0) {
        const h = helps.nth(Math.floor(Math.random() * (await helps.count())));
        sim("log", name, `${await h.innerText()}.`);
        await h.click();
      } else if (r < 0.92) {
        const text = pick(FREE_TEXT);
        await phone.locator("#action").fill(text);
        await sleep(600);
        sim("log", name, `Types: “${text}”`);
        await phone.getByRole("button", { name: "Lock it in" }).click();
      } else {
        sim("log", name, "Holds back.");
        await phone.getByRole("button", { name: "Hold back" }).click();
      }
      await phone.locator("#action").waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
    } catch (e) {
      if (!done) sim("log", name, `Bot hiccup: ${e.message.split("\n")[0]}`, "note");
    }
  }
}

// A headset player: no DOM to click in a 3D room, so the bot uses the room's own hooks (window.wfVR).
async function playVr(page, sim, name) {
  const vr = (fn, ...args) => page.frame({ name }).evaluate(([f, a]) => window.wfVR && window.wfVR[f](...a), [fn, args]);
  while (!done) {
    await sleep(800);
    try {
      const st = await vr("state");
      if (!st) continue;
      if (st.dieReady) {
        await think();
        sim("focus", name);
        sim("log", name, "Grabs the die and throws it across the table.");
        await vr("throwDie");
        await sleep(2500);
        continue;
      }
      if (!st.canAct) continue;
      await think();
      sim("focus", name);
      if (Math.random() < 0.2) await vr("ability", 0);
      const r = Math.random();
      if (r < 0.7 && st.options.length) {
        const i = Math.floor(Math.random() * st.options.length);
        sim("log", name, `Points at “${st.options[i]}”`);
        await vr("choose", i);
      } else if (r < 0.88 && st.helps.length) {
        const i = Math.floor(Math.random() * st.helps.length);
        sim("log", name, `Points at Help ${st.helps[i]}.`);
        await vr("help", i);
      } else {
        sim("log", name, "Points at Hold back.");
        await vr("hold");
      }
      // Wait for the move to land before looking again, like the phone bots do.
      for (let i = 0; i < 16 && !done; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const now = await vr("state").catch(() => null);
        if (!now || !now.canAct) break;
      }
    } catch (e) {
      if (!done) sim("log", name, `Bot hiccup: ${e.message.split("\n")[0]}`, "note");
    }
  }
}

// The table runs the GM on its own; this only presses the host's "stuck" buttons and spots the ending.
async function watchTable(page, sim) {
  const table = page.frameLocator('iframe[name="table"]');
  let scene = "";
  while (!done) {
    await sleep(1500);
    try {
      if (await visible(table.getByRole("heading", { name: "The end" }))) {
        done = true;
        sim("log", "table", "The end. Adventure complete.");
        sim("status", "Finished");
        return;
      }
      const sceneText = await table.getByText(/^Scene \d+ of \d+$/).first().innerText({ timeout: 500 }).catch(() => "");
      if (sceneText && sceneText !== scene) {
        scene = sceneText;
        sim("log", "table", `${sceneText}.`);
        sim("status", sceneText);
      }
      for (const label of [/^Roll for /, "Don't wait", "Move the story on"]) {
        const b = table.getByRole("button", { name: label });
        if (await visible(b)) {
          sim("log", "table", `Host presses “${await b.innerText()}”.`, "note");
          await b.click();
        }
      }
    } catch {}
  }
}

(async () => {
  const hasKey = /^ANTHROPIC_API_KEY=\S/m.test(fs.existsSync(path.join(ROOT, ".env.server")) ? fs.readFileSync(path.join(ROOT, ".env.server"), "utf8") : "");
  console.log(`Starting sf dev on ${DEV_PORT} (${hasKey ? "AI GM" : "backup narrator"})…`);
  const { proc, capability } = await startDev();
  const stage = await startStage();
  const devOrigin = new URL(capability).origin;
  const stopAll = () => { done = true; proc.kill(); stage.close(); };
  process.on("SIGINT", () => { stopAll(); process.exit(0); });

  const browser = await chromium.launch({ headless: HEADLESS, args: ["--window-size=1680,1000", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const context = await browser.newContext({ viewport: HEADLESS ? { width: 1680, height: 1000 } : null });
  const page = await context.newPage();
  browser.on("disconnected", () => { stopAll(); process.exit(0); });

  // Trade the private URL for the dev-server cookie, then open the stage.
  await page.goto(capability);
  await page.waitForFunction(() => document.title !== "Open Spacefast Zero dev", null, { timeout: 15000 });
  const query = new URLSearchParams({ dev: devOrigin, players: PLAYERS.join(","), vr: HEADSETS.join(",") });
  if (MANUAL) query.set("manual", "1");
  await page.goto(`http://127.0.0.1:${STAGE_PORT}/?${query}`);
  const sim = (fn, ...args) => {
    if (fn === "log") console.log(`[${args[0]}] ${args[1]}`);
    return page.evaluate(([f, a]) => window.sim[f](...a), [fn, args]).catch(() => {});
  };
  sim("log", "table", hasKey ? "Narrator: AI GM (uses your Anthropic key)." : "Narrator: backup (no ANTHROPIC_API_KEY in .env.server).", "note");

  if (MANUAL) {
    sim("status", "Manual");
    console.log("Manual mode. Close the window or press Ctrl-C to stop.");
    return;
  }

  const code = await host(page, sim);
  for (const [i, name] of PLAYERS.entries()) await join(page, sim, name, code, PREGENS[i % PREGENS.length]);
  for (const [i, name] of HEADSETS.entries()) await join(page, sim, name, code, PREGENS[(PLAYERS.length + i) % PREGENS.length], true);

  const table = page.frameLocator('iframe[name="table"]');
  const begin = table.getByRole("button", { name: "Begin the adventure" });
  for (let i = 0; i < 40 && !(await visible(begin)); i++) await new Promise((r) => setTimeout(r, 250));
  await think();
  sim("focus", "table");
  sim("log", "table", "Host begins the adventure.");
  await begin.click();
  sim("status", "Playing");

  let shots = 0;
  if (HEADLESS) {
    fs.rmSync(SHOTS, { recursive: true, force: true });
    fs.mkdirSync(SHOTS, { recursive: true });
  }
  const snap = HEADLESS
    ? setInterval(() => {
        page.screenshot({ path: path.join(SHOTS, `sim-${String(++shots).padStart(2, "0")}.png`) }).catch(() => {});
      }, 15000)
    : null;
  await Promise.all([watchTable(page, sim), ...PLAYERS.map((name) => play(page, sim, name)), ...HEADSETS.map((name) => playVr(page, sim, name))]);
  if (snap) clearInterval(snap);
  if (HEADLESS) {
    await page.screenshot({ path: path.join(SHOTS, "sim-end.png") }).catch(() => {});
    console.log(`Screenshots: ${SHOTS}`);
    await browser.close();
    stopAll();
    return;
  }
  console.log("Adventure complete. Close the window or press Ctrl-C to stop.");
})().catch((e) => {
  console.error("FAIL", e.message.split("\n")[0]);
  process.exit(1);
});
