# AGENTS.md

このファイルには、別セッションでも再発しやすい開発上の注意点だけを記録する。
要件と実装順序の正本は `docs/specification.md` と `docs/planning.md` を参照すること。

## Windows / Node.js

- PowerShellでは実行ポリシーにより `npm.ps1` が拒否されることがある。npmを実行するときは `npm` ではなく `C:\Program Files\nodejs\npm.cmd` を使用する。
- このリポジトリは `.nvmrc` のNode.jsを前提とする。2026-09-21時点ではNode.js 24.18.0。
- InfraはTypeScriptをJavaScriptへ出力しない。`infra/tsconfig.json` の `noEmit: true` を維持し、CDKアプリの実行には `tsx` を使う。
- `ts-node` は現在のTypeScriptとの組み合わせでCDK synth時に失敗したため、再導入しない。発生したエラーは `Cannot read properties of undefined (reading 'fileExists')`。
- npm registryへの接続で `UNABLE_TO_VERIFY_LEAF_SIGNATURE` が出る環境では、`NODE_OPTIONS=--use-system-ca` を設定する。
- npm cacheの既定ディレクトリへ書き込めない場合は、Git無視済みの `D:\manga\.npm-cache` を `--cache` で指定する。

## CDK / ビルド

- `infra` の `BucketDeployment` は `frontend/dist` をassetにするため、synthより前にFrontend buildが必要。通常は `infra/package.json` の `npm run synth`を使えば先にbuildされる。
- AWSへ接続しない確認には `cdk synth`を使う。`cdk diff`はデプロイ済みStackとの比較でAWS認証を必要とする場合がある。
- ユーザーから明示的な依頼がない限り、`cdk deploy`、`cdk bootstrap`、AWSリソースを変更するコマンドを実行しない。
- CloudFront標準ドメインのデフォルト証明書を使う間は、Distributionへ `minimumProtocolVersion` を指定しても効果がなくCDK警告になる。独自ドメインと証明書を追加するPhaseまで指定しない。
- 現在インストール済みのCDKではS3 OACに `S3BucketOrigin.withOriginAccessControl(...)` を使用している。古いOAI APIへ戻さない。
- CDKが表示する「feature flags are not configured」はsynth失敗ではない。内容を確認せず大量のflagを追加しない。

## Phase 1の一時的な保護

- Phase 1では `/manga/*` にTrusted Key Groupがまだない。その間に漫画をCloudFront経由で公開しないよう、`PhaseOneMangaGuard`がviewer requestで必ず403を返す。
- Phase 2ではガードを単純に削除するのではなく、CloudFront Public Key / Key GroupとSigned Cookie保護へ置き換えてから削除する。
- SPA rewriteは `/api/*` と `/manga/*` を `index.html` へ変換してはいけない。認証の403やAPIエラーをSPAの200レスポンスで隠してしまうため。
- 漫画Bucketの `RemovalPolicy.RETAIN` と `autoDeleteObjects: false` は必須。`cdk destroy`に漫画データを連動させない。
- 漫画画像をCDK assetやFrontend build成果物へ含めない。管理画面からPresigned PUTでアップロードする。

## 生成物とGit差分

- `cdk.out`、`.cdk.staging`、`*.tsbuildinfo`、`frontend/dist`、Infra配下の誤生成JavaScriptは `.gitignore` 済み。この設定を弱めない。
- InfraのソースはTypeScriptで管理する。依存管理用の `package.json`、`package-lock.json`、`cdk.json`、`tsconfig.json` は必要だが、コンパイル済みJavaScriptをコミットしない。
- synth結果を一時的に詳しく調べる場合は、`cdk synth --output <一時ディレクトリ>`を使うとワークスペースへ `cdk.out` を残さずに済む。

## 確認コマンド

Infra変更後は最低限、次を実行する。

```powershell
cd D:\manga\infra
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
& 'C:\Program Files\nodejs\npm.cmd' run test
& 'C:\Program Files\nodejs\npm.cmd' run synth
```

`npm run synth` はAWSへデプロイしないが、通常設定では無視対象の `infra/cdk.out` を生成する。成果物自体も残したくない場合は、一時ディレクトリを `cdk synth --output` へ指定すること。
