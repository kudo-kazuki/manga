# Phase 4: Presigned PUT / Progress / Retry 実装記録

作業日: 2026-09-21

## 1. 実装範囲

管理画面で選択した画像をBrowser内で1枚ずつWebPへ変換し、画像binaryをLambdaへ送らずS3へ直接PUTする経路を実装した。

```text
Browser -- 管理Cookie + file情報 --> Presign Lambda
Browser <-- 15分有効のPUT URL ------ Presign Lambda
Browser -- WebP Blob --------------> S3 manga/*
```

Presign APIは次の制約を持つ。

- `POST /api/upload/presign`
- 有効なHttpOnly管理session Cookieが必須
- 1 requestあたり1～100件
- `workId`、`chapterId`、`001.webp`形式のfile名をallow-list検証
- `Content-Type: image/webp`だけを許可
- ClientからS3 Keyを受け取らず、Backendが `manga/{workId}/{chapterId}/{file}` を組み立てる
- Presigned URLの初期有効期限は15分
- LambdaのPutObject権限は漫画Bucketの `manga/*` に限定
- URLや管理署名鍵をログへ出力しない

## 2. Browser側のqueue

Presigned URLを全件分まとめて発行せず、chapter境界をまたがない100件以下のbatchを処理直前に取得する。各batch内は初期値5 workerで次を繰り返す。

```text
File -> WebP変換 -> S3 PUT -> Blob参照解放 -> 次のFile
```

管理画面には全件数、変換済み数、Upload済み数、失敗数、現在処理中のfile、元容量、変換後容量、圧縮率、全体progressを表示する。同一画面を開いている間はPause、Resume、失敗fileだけのRetryが可能である。Retry時は期限切れURLを再利用せず、失敗fileだけのURLを再発行する。

全画像成功後の `metadata.json` と `manga/index.json` の確定はPhase 5で実装する。このPhaseでは画像が揃っても作品を公開済みにはしない。

## 3. S3 CORSと初回deploy

S3への直接PUTだけはBrowserから別originへ接続するため、漫画Bucketに次だけを許可した。

- Method: `PUT`
- Headers: `content-type`, `cache-control`
- Origin: CloudFormation Parameter `UploadAllowedOrigin` の完全一致値
- `AllowedOrigins: *` は使用しない

CloudFront標準domainはDistribution作成後に判明し、Bucket CORSから直接参照すると循環依存になる。そのため初回deploy時の既定値は安全な無効originとし、`SiteUrl` が判明した後に次のようにOriginを指定して再deployする。2026-09-22の実AWS確認で、local Vite serverからもuploadできるよう`http://localhost:4646`は本番originと別に固定許可した。

```powershell
cd D:\manga\infra
& 'C:\Program Files\nodejs\npm.cmd' run deploy -- --parameters UploadAllowedOrigin=https://xxxxxxxxxxxxxx.cloudfront.net
```

この記録作成時点ではAWSへのdeployは実行していない。

## 4. SSM Parameter

Phase 4で新しいSSM Parameterは増えない。Presign LambdaはPhase 3で追加した次の管理署名鍵を実行時に参照する。

```text
/manga/admin-signing-key
```

したがって、ローカルのtypecheck、test、synthだけならSSM登録は不要である。実環境へdeployして管理ログインとPresign APIを使う前には、Phase 2・3で定義した認証用SecureStringをAWSコンソール等から登録する必要がある。

## 5. 確認結果

- Backend typecheck成功
- Backend unit test 26件成功
- Frontend type-check成功
- Frontend unit test 23件成功
- Frontend ESLint成功
- Frontend production build成功
- Infra typecheck成功
- Infra unit test 4件成功
- CDK synth成功
- 未認証・改ざん管理Cookieの拒否をunit testで確認
- 100件batch、15分TTL、`manga/*` Key生成をunit testで確認
- concurrency上限、Pause / Resume、失敗分だけのRetryをunit testで確認
- synth結果でS3限定CORS、Presign route、SSM参照権限、`manga/*` PutObject権限を確認
- 漫画Bucketの `RETAIN` を維持

Viteには既存の500 kB超chunk警告があるが、buildは成功している。

## 6. 次の実装

Phase 5では、全画像の成功をBackendでも再検証したうえで `metadata.json` と `manga/index.json` を確定し、作品一覧、chapter一覧、Viewerへ接続する。
