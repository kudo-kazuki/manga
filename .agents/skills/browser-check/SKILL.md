---
name: browser-check
description: Chromium と Playwright でこのリポジトリの frontend を実ブラウザ確認する。ユーザーが明示的に依頼・許可した場合だけ、dev サーバー、ブラウザ、スクリーンショットを起動する。
---

# browser-check — Windows での実ブラウザ確認

Playwright が操作する Chromium で `frontend/` を実際に開き、画面・操作・コンソールエラーを確認する。静的なコードレビューや unit test の代替ではない。ユーザーが「ブラウザで確認して」「スクリーンショットを撮って」などと明示したときだけ使う。

## 安全な運用

1. ブラウザ確認を提案しただけでは起動しない。dev サーバーや Chromium を起動する前に、ユーザーの明確な依頼または許可が必要。
2. 起動する直前に「これから frontend の dev サーバーと Chromium を起動します」と伝える。
3. 既存の dev サーバーは停止しない。`dev-server.mjs status` が `mine` と判定した、このスキル自身が起動したサーバーだけを `stop` できる。`theirs` / `unknown` は相乗りし、停止しない。
4. Chromium は `finally` で必ず閉じる。確認用 PNG は既定の OS 一時ディレクトリへ出力し、リポジトリには保存しない。
5. `npm install` と `npx playwright install chromium` は依存の書き込み・ネットワーク利用を伴うため、前提が不足していても勝手に実行せず、必要なコマンドを示してユーザーの許可を得る。

## 構成

| ファイル | 用途 |
|---|---|
| `preflight.mjs` | Playwright、Chromium、dev サーバーを起動せずに診断する |
| `dev-server.mjs` | Windows のポート・親子プロセス情報で dev サーバーの所有者を判定し、安全に起動・停止する |
| `lib.mjs` | Playwright を読み込み、ページ遷移・待機・スクリーンショットを共通化する |
| `shot.mjs` | 指定パスのスクリーンショットを1枚撮る CLI |

## 前提を整える

Playwright は `frontend/` の開発依存に置く。アプリのビルド成果物には含まれず、確認ツールとして依存関係とバージョンを揃えられるためである。

```powershell
cd D:\manga\frontend
& 'C:\Program Files\nodejs\npm.cmd' install --save-dev playwright
& 'C:\Program Files\nodejs\npx.cmd' playwright install chromium
```

上記はユーザーの許可を得てから実行する。`playwright install` が取得する Chromium は `node_modules` ではなく Playwright のキャッシュに保存される。

## 実行手順

まず、ブラウザや dev サーバーを起動しない診断を行う。

```powershell
node .agents\skills\browser-check\preflight.mjs
```

前提が整い、ユーザーの明示許可がある場合だけ起動する。

```powershell
node .agents\skills\browser-check\dev-server.mjs start
node .agents\skills\browser-check\shot.mjs / --wait "#app"
```

レスポンシブ確認の例:

```powershell
node .agents\skills\browser-check\shot.mjs / --width 375 --height 800 --name mobile
```

画面固有の操作を確認するときは、リポジトリ直下に一時的な Node スクリプトを作り、`./.agents/skills/browser-check/lib.mjs` から `open`、`visit`、`shot`、`waitForSettled` を import する。セレクタは推測せず、対象コンポーネントの template から確認する。

確認が終わったら、`browser.close()` を通す。`dev-server.mjs status` が `mine` の場合だけ、起動したサーバーを停止する。

```powershell
node .agents\skills\browser-check\dev-server.mjs stop
```

## 留意点

- 既定の URL は `frontend/vite.config.ts` と同じ `http://localhost:4646`。別の URL を確認する場合だけ `BROWSER_CHECK_BASE` を設定する。
- `--full` は document 全体を撮る。内部スクロール領域の全体を撮れるとは限らないため、その場合は目的の領域を操作して通常のスクリーンショットを撮る。
- DOM の値を確かめる必要があるときは、画像から文字を読み取るより Playwright の locator で取得して標準出力へ出す方が確実である。