# Project Instructions

- Respond to the user in Japanese unless they explicitly request another language.
- Use npm for package management in this project.
- Use the Node version specified in `.nvmrc` as the project baseline.
- If `node` or `npm` is not available on PATH, try `C:\Program Files\nodejs\node.exe` and `C:\Program Files\nodejs\npm.cmd` before reporting that Node/npm is unavailable.
- Do not create or update `package-lock.json` unless the user explicitly asks for it.
- When checking npm metadata or installing dependencies, prefer using a temporary cache inside the workspace if the default npm cache has permission issues.
- After dependency or build-related changes, verify with the narrowest useful command first. Use `npm install --dry-run --ignore-scripts --package-lock=false` for dependency resolution checks when a lockfile should not be generated.
- After changing question data, pages, components, or other source files, run `npm run build` when practical to catch syntax, type, and bundling errors.
- In this Windows environment, if `npm` is not available on PATH, run builds with: `$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH; & 'C:\Program Files\nodejs\npm.cmd' run build`.
- If a sandboxed build fails with Vite `spawn EPERM`, treat it as a sandbox/process-spawn issue rather than an application build failure and rerun the same build with the already-approved elevated build command when available.
- PowerShell 経由で日本語を含むファイルを読むときは、`Get-Content` を安易に使わず UTF-8 を明示して読むこと。
- 文字化けして見える内容を根拠に、そのままファイルを再作成・上書きしないこと。
- 日本語ファイルを編集する前に、表示内容が正常かを確認してから変更すること。
