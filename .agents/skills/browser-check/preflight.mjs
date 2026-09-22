/** ブラウザや dev サーバーを起動せず、実ブラウザ確認の前提だけを診断する。 */
import fs from "node:fs";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { ownership } from "./dev-server.mjs";
import { BASE, FRONTEND_ROOT, OUT, PLAYWRIGHT_ENTRY } from "./lib.mjs";
const results = [];
const add = (ok, name, detail, remedy) => results.push({ ok, name, detail, remedy });
const hasPlaywright = fs.existsSync(PLAYWRIGHT_ENTRY);
add(hasPlaywright, "playwright", hasPlaywright ? PLAYWRIGHT_ENTRY : "frontend/node_modules にありません", `cd ${FRONTEND_ROOT} && npm install --save-dev playwright`);
let chromiumPath = null;
if (hasPlaywright) { try { chromiumPath = (await import(pathToFileURL(PLAYWRIGHT_ENTRY).href)).chromium.executablePath(); } catch { /* 不足として扱う */ } }
add(Boolean(chromiumPath && fs.existsSync(chromiumPath)), "Chromium", chromiumPath && fs.existsSync(chromiumPath) ? chromiumPath : "インストールされていません", `cd ${FRONTEND_ROOT} && npx playwright install chromium`);
let responseDetail = `${BASE} に接続できません`;
let responding = false;
try { const response = await fetch(BASE, { signal: AbortSignal.timeout(3_000) }); responding = response.ok; responseDetail = `${BASE} → HTTP ${response.status}`; } catch { /* 診断結果に反映する */ }
const owner = ownership();
const ownerText = { none: "起動していない", mine: "このスキルが起動したもの", theirs: "既存のサーバー（停止しない）", unknown: "所有者不明（停止しない）" }[owner.state];
add(responding, "dev サーバー", `${responseDetail}／${ownerText}`, "node .agents\\skills\\browser-check\\dev-server.mjs start");
console.log("\n=== browser-check 前提診断（起動はしません） ===\n");
for (const result of results) console.log(`${result.ok ? "OK" : "NG"}  ${result.name}: ${result.detail}`);
console.log(`\n使用可能メモリ（概算）: ${Math.round(os.freemem() / 1024 / 1024)}MB`);
console.log(`出力先: ${OUT}`);
const failed = results.filter((result) => !result.ok);
if (failed.length) { console.log("\n不足している前提（実行にはユーザー許可が必要）:"); for (const result of failed) console.log(`- ${result.name}: ${result.remedy}`); process.exitCode = 1; } else console.log("\n前提は満たしています。ユーザーの明示許可後に確認を開始できます。");