# Phase 2 閲覧認証 実装記録

作業日: 2026-09-21

- 実施日: 2026-09-21
- 対象Phase: Phase 2「Signed Cookie / Login」のローカル実装とsynth確認
- AWS環境への変更: なし

## 1. 実装範囲

Phase 1の一時的な403ガードを、CloudFront Trusted Key Groupによる本来の保護へ置き換えた。

- CloudFront Public Key / Key Group
- `/manga/*` BehaviorのTrusted Key Group
- API Gateway HTTP API
- `POST /api/login`
- `POST /api/logout`
- Login / Logout Lambda（Node.js 24、arm64）
- SSM Parameter Store SecureStringの実行時参照
- Frontendの共通パスワードログインとログアウト
- `/api/*` のCloudFront Behavior（cache無効）

デプロイ、SSM値登録、実環境での200/403確認は行っていない。

## 2. 認証方式

閲覧パスワードは平文で保存せず、次の形式のscrypt導出値をSSM SecureStringへ保存する。

```text
scrypt$<base64 salt>$<base64 derived key>
```

Login Lambdaは `ssm:GetParameter` を次の2 Parameterだけに許可される。

```text
/manga/viewer-password-hash
/manga/cloudfront-private-key
```

パスワードはscryptで導出し、`timingSafeEqual` で比較する。成功時はCloudFront Custom PolicyをRSA-SHA1で署名し、次の3 Cookieを返す。

```text
CloudFront-Policy
CloudFront-Signature
CloudFront-Key-Pair-Id
```

Cookie属性は `Secure; HttpOnly; SameSite=Lax; Path=/`。実装当初は24時間だったが、2026-09-22に永続Cookieの30日へ変更した。ポリシーのResourceは、CloudFront viewer requestで取得したhostの `/manga/*` だけに限定する。

## 3. CloudFrontとAPI

`/api/*` はcacheを無効にし、API Gateway HTTP APIへ転送する。viewer requestのCloudFront Functionが閲覧時のhostを `x-manga-viewer-host` に設定するため、LambdaがAPI Gatewayのhostを署名対象にすることはない。

Phase 1の `PhaseOneMangaGuard` は削除した。`/manga/*` にはKey Groupを設定済みなので、署名CookieがないリクエストはCloudFrontが拒否する。

公開鍵PEMはsecretではないが環境固有値なので、CloudFormation Parameter `CloudFrontPublicKeyPem` としてdeploy時に渡す。秘密鍵はCDK parameterやFrontendへ入れず、SSM SecureStringからLambdaだけが取得する。

## 4. Frontend

- username欄を削除し、仕様どおり共通passwordだけにした。
- `fetch('/api/login')` と `fetch('/api/logout')` は `credentials: 'include'` を使う。
- 401とnetwork errorを別メッセージにした。
- passwordはPiniaやlocalStorageへ保存しない。
- Login成功後は安全なアプリ内redirect、未指定なら作品一覧へ移動する。

## 5. 確認結果

次はすべて成功した。

- Backend typecheck
- Backend unit test 4件
- Frontend type-check
- Frontend unit test 5件
- Frontend ESLint
- Frontend production build
- Infra typecheck
- Infra unit test 4件
- CDK synth
- synth結果でPublic Key / Key Group、HTTP API、2 route、2 application Lambdaを確認
- synth結果で禁止AWSサービスが0件であることを確認
- 漫画Bucketの `DeletionPolicy: Retain` / `UpdateReplacePolicy: Retain` を維持

Vite buildには既存bundleが500 kBを超える警告があるが、build失敗ではない。

## 6. 実環境で残る確認

Phase 2完了条件のうち、以下はdeploy後に確認する必要がある。

- 未ログインの `/manga/test.webp` が403
- 正しい共通passwordでLoginが200
- Login後の漫画画像が200
- Cookie期限切れ後に403
- 漫画BucketのS3 URLが常に403

deployはAWS resourceを変更するため、ユーザーから明示的に依頼された場合だけ実行する。
