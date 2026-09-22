/** Chromium / Playwright による実ブラウザ確認の共通処理。 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "../../..");
export const FRONTEND_ROOT = path.join(REPO_ROOT, "frontend");
export const PLAYWRIGHT_ENTRY = path.join(FRONTEND_ROOT, "node_modules/playwright/index.mjs");
export const BASE = process.env.BROWSER_CHECK_BASE ?? "http://localhost:4646";
export const OUT = process.env.BROWSER_CHECK_OUT ?? path.join(os.tmpdir(), "manga-browser-check");
fs.mkdirSync(OUT, { recursive: true });
export const outFile = (name) => { const file = path.resolve(OUT, name); const relative = path.relative(OUT, file); if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`出力先が一時ディレクトリの外になります: ${name}`); return file; };
export const loadChromium = async () => { if (!fs.existsSync(PLAYWRIGHT_ENTRY)) throw new Error(`playwright がありません: ${PLAYWRIGHT_ENTRY}\n  → cd ${FRONTEND_ROOT} && npm install --save-dev playwright`); return (await import(pathToFileURL(PLAYWRIGHT_ENTRY).href)).chromium; };
const attachDiagnostics = (page) => { const seen = new Set(); const report = (label, text) => { const key = `${label}:${text}`; if (!seen.has(key) && seen.size < 30) { seen.add(key); console.log(`${label}: ${text}`); } }; page.on("pageerror", (error) => report("PAGEERROR", error.message.slice(0, 300))); page.on("console", (message) => { if (message.type() === "error") report("CONSOLE", message.text().slice(0, 300)); }); };
export const open = async ({ viewport = { width: 1440, height: 900 } } = {}) => { const browser = await (await loadChromium()).launch({ headless: true }); try { const context = await browser.newContext({ viewport }); const page = await context.newPage(); attachDiagnostics(page); return { browser, context, page }; } catch (error) { await browser.close().catch(() => {}); throw error; } };
export const waitForSettled = async (page, { quietMs = 500, timeout = 30_000 } = {}) => page.evaluate(({ quiet, limit }) => new Promise((resolve) => { let timer; const done = (settled) => { observer.disconnect(); clearTimeout(timer); clearTimeout(deadline); resolve(settled); }; const restart = () => { clearTimeout(timer); timer = setTimeout(() => done(true), quiet); }; const observer = new MutationObserver(restart); const deadline = setTimeout(() => done(false), limit); observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true }); restart(); }), { quiet: quietMs, limit: timeout });
export const visit = async (page, urlPath = "/", waitFor, { settle = true } = {}) => { if (!urlPath.startsWith("/")) throw new Error(`パスは / で始めてください: ${urlPath}`); await page.goto(new URL(urlPath, BASE).toString(), { waitUntil: "domcontentloaded", timeout: 180_000 }); if (waitFor) await page.locator(waitFor).first().waitFor({ state: "visible", timeout: 120_000 }); if (settle) {
    try {
      if (!(await waitForSettled(page))) console.log("waitForSettled: DOM の変化が止まりませんでした（続行）");
    } catch (error) {
      if (!String(error).includes("Execution context was destroyed")) throw error;
      await page.waitForLoadState("domcontentloaded");
      if (!(await waitForSettled(page))) console.log("waitForSettled: DOM の変化が止まりませんでした（続行）");
    }
  } };
export const shot = async (page, name, { fullPage = false } = {}) => { const file = outFile(`${name}.png`); await page.screenshot({ path: file, fullPage, timeout: 60_000 }); console.log(`shot: ${file}`); return file; };