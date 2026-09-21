# Phase 3 管理画面・ローカル画像処理 実装記録

- 実施日: 2026-09-21
- 対象Phase: Phase 3「Admin / Directory D&D / Natural Sort / WebP」
- AWS環境への変更: なし

## 1. 実装範囲

### Backend / Infra

- `POST /api/admin/login`
- `POST /api/admin/logout`
- `GET /api/admin/session`
- 閲覧用とは別の管理password検証
- DB不要のHMAC署名付き管理session Cookie
- session用途、署名、期限、nonceの検証
- API Gateway HTTP APIの簡易throttle（5 req/s、burst 10）
- 管理LambdaごとのSSM/IAM最小権限
- Lambdaログ保持7日、Node.js 24、arm64、128MB

管理Cookieは `Manga-Admin-Session`。属性は `Secure; HttpOnly; SameSite=Lax; Path=/api` とした。FrontendはCookie値を読まず、session確認APIの結果だけで `/admin` の表示可否を判断する。

### Frontend

- `/admin/login`
- `/admin`
- 作品フォルダ1個のDrag & Drop
- `webkitdirectory`によるfolder picker fallback
- `DataTransferItem.webkitGetAsEntry()`の再帰走査
- `作品 / chapter / image` の3階層検証
- JPEG/PNG以外と想定外階層の警告・除外
- chapter/pageのNatural Sort
- chapter IDとpage filenameのzero padding
- 日本語表示名を保持した安全なASCII作品ID
- 作品名、chapter数、画像数、元容量、chapter別page数のpreview
- WebP quality設定UI（初期値0.85）
- Canvasを使った1画像単位のWebP変換
- 並列数制限付き変換queue
- Pause / Resume / failed itemだけのRetryが可能なqueue構造
- WebP Blobをconsumerへ渡した後にqueue内へ保持しない設計

S3へのPresigned PUTと進捗UIへの接続はPhase 4で行う。Phase 3では、画像を全件同時decodeしないローカル処理基盤までを実装した。

## 2. IDと並び順

`Intl.Collator('ja', { numeric: true })` を使い、次の順になることをテストした。

```text
1.jpg, 2.jpg, 10.jpg
1巻, 2巻, 10巻
```

内部IDは最低3桁でzero paddingする。

```text
chapter: 001
page:    001.webp
```

作品IDはASCII化できる部分をslugにし、日本語だけの作品名でも安定したhash suffixを使って安全なIDを生成する。表示用の日本語タイトルは別に保持する。

## 3. メモリ管理

folder解析時はFile参照、path、sizeだけを扱い、画像をdecodeしない。WebP変換時は制限付きworkerが1画像ずつ次の処理を行う。

```text
File -> createImageBitmap -> Canvas -> WebP Blob -> consumer -> 参照解放
```

変換後は `ImageBitmap.close()` を呼び、Canvas寸法を0へ戻す。queueはBlob本体をstateへ保存せず、変換後サイズと成功・失敗状態だけを保持する。

## 4. 追加で必要になるSSM Parameter

Phase 3を実環境で使う前に、Phase 2の2件に加えて次をSecureStringで登録する。

```text
/manga/admin-password-hash
/manga/admin-signing-key
```

管理password導出値は閲覧passwordと別にする。署名鍵は十分に長いランダム値を使用し、FrontendやGitへ置かない。

## 5. 確認結果

- Backend typecheck成功
- Backend unit test 9件成功
- Frontend type-check成功
- Frontend unit test 15件成功
- Frontend ESLint成功
- Frontend production build成功
- Infra typecheck成功
- Infra unit test 4件成功
- CDK synth成功
- 50 chapter × 200 images、合計10,000件の解析テスト成功
- 変換queueのconcurrency上限と失敗分だけのRetryテスト成功
- synth結果で禁止AWSサービスが0件
- 漫画BucketのRETAINを維持

Viteには既存の500 kB超chunk警告があるが、buildは成功している。

## 6. 次の実装

Phase 4では次を接続する。

1. 管理session検証middlewareのPresign API利用
2. S3 Keyとrequest schemaの厳格な検証
3. 100件単位のPresigned PUT URL発行
4. BrowserでWebP変換後、S3へ直接PUT
5. Upload progress、Pause、Resume、Retry failed files
6. 全画像成功後だけcomplete APIを呼ぶ準備
