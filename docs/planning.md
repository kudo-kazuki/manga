# プライベート漫画閲覧サイト 実装計画

## 0. 実装方針

- [`specification.md`](./specification.md) を要件の基準とする。
- 初期構築では独自ドメインを使わず、CloudFront 標準ドメインを使用する。
- 独自ドメインは任意設定として後から追加できる構造にする。
- AWS CDK v2、TypeScript、Vue 3、Vite、Lambda Node.js LTSを使用する。
- DBと常時稼働サーバーを使用しない。
- 漫画画像をCDK assetへ含めない。
- 各段階でテストと動作確認を終えてから次へ進む。
- 現在インストールされているCDKの型定義を確認し、古いAPIを推測で使用しない。

## 1. 全体実装順序

```text
1. 既存Frontendと開発環境の棚卸し
2. Infra基盤作成
3. Phase 1: SPA配信
4. Backend認証作成
5. Phase 2: Signed Cookieによる漫画保護
6. Frontend管理画面のローカル処理
7. Backend Upload API作成
8. Phase 4: S3 direct upload
9. Backend metadata確定処理
10. Frontend作品一覧・Viewer
11. エラー処理・セキュリティ・料金・README
12. 総合テスト
```

## 2. 事前準備・共通作業

### 2.1 リポジトリ確認

- [ ] 既存 `frontend/package.json` の依存関係とscriptを確認する。
- [ ] Vue Router、Pinia、Element Plus等の現在の利用状況を確認する。
- [ ] TypeScript、ESLint、Prettier設定を確認する。
- [ ] `.gitignore` に秘密鍵、環境ファイル、CDK出力物、build成果物を追加する。
- [ ] Node.jsバージョンを `.nvmrc` とLambda対応LTSで揃える。
- [ ] ルート、Frontend、Infra、Backendのnpm workspace採用要否を判断する。

### 2.2 共通型

- [ ] Work metadata型を定義する。
- [ ] Chapter metadata型を定義する。
- [ ] Upload presign request/response型を定義する。
- [ ] Upload completion request/response型を定義する。
- [ ] API error codeを定義する。
- [ ] BackendとFrontendで共有する型の配置方法を決める。

### 2.3 設定値

- [ ] AWS accountとregionをcontextまたは環境変数から解決する。
- [ ] 標準regionは `ap-northeast-1` とする。
- [x] Signed Cookieと管理sessionの初期有効期限を30日とし、永続Cookieにする。
- [ ] Presigned URL有効期限の初期値を15分とする。
- [ ] Presign batch sizeの初期値を100件とする。
- [ ] Upload concurrencyの初期値を5程度とする。
- [x] WebP qualityの初期値を0.70とする。
- [ ] 任意の独自ドメイン設定を型で表現する。

## 3. インフラ実装

### 3.1 CDKプロジェクト作成

- [ ] `infra/package.json` を作成する。
- [ ] AWS CDK v2とconstructsを導入する。
- [ ] TypeScript設定を作成する。
- [ ] `infra/bin/app.ts` を作成する。
- [ ] `infra/lib/manga-stack.ts` を作成する。
- [ ] `cdk synth`、`cdk diff`、`cdk deploy` 用scriptを作成する。
- [ ] CDK contextにsecret値を保存しない仕組みにする。

確認:

- [ ] `npm run typecheck` が成功する。
- [ ] `cdk synth` が成功する。
- [ ] synthされたテンプレートに禁止AWSサービスが含まれない。

### 3.2 SPA用S3 Bucket

- [ ] Block Public Accessをすべて有効にする。
- [ ] `publicReadAccess: false` とする。
- [ ] `enforceSSL: true` とする。
- [ ] 不要なversioningとaccess logを有効にしない。
- [ ] SPA成果物だけを保存する。
- [ ] 漫画画像をこのBucketへ混在させない。
- [ ] 削除ポリシーを環境に応じて明示する。

### 3.3 漫画用S3 Bucket

- [ ] Block Public Accessをすべて有効にする。
- [ ] `publicReadAccess: false` とする。
- [ ] `enforceSSL: true` とする。
- [ ] versioningは有効化しない。
- [ ] `RemovalPolicy.RETAIN` とする。
- [ ] `autoDeleteObjects: false` とする。
- [ ] `/manga/` prefixへ漫画データを保存する。
- [ ] OAC経由のGETのみ許可するBucket Policyを設定する。
- [ ] Lambdaには必要なprefixとactionだけを許可する。
- [ ] Presigned PUT用の限定CORSを設定する。

確認:

- [ ] S3 object URLからの匿名GETが403になる。
- [ ] `cdk destroy` で漫画Bucketが削除されない。
- [ ] Bucket PolicyにPrincipal `*` の公開許可がない。

### 3.4 CloudFront OAC

- [ ] SPA Bucket用originをOACで構成する。
- [ ] 漫画Bucket用originをOACで構成する。
- [ ] OAIではなくOACが作られていることをsynthで確認する。
- [ ] S3 website endpointを使用しない。

### 3.5 CloudFront Distribution

- [ ] デフォルトBehaviorをSPA用S3へ向ける。
- [ ] `/manga/*` Behaviorを漫画用S3へ向ける。
- [ ] `/api/*` BehaviorをAPI Gateway HTTP APIへ向ける。
- [ ] Viewer protocolをHTTPS redirectにする。
- [ ] API Behaviorはキャッシュを無効化する。
- [ ] API BehaviorでCookie、必要header、query stringを適切に転送する。
- [ ] 漫画画像は長期キャッシュ可能な方針にする。
- [ ] `metadata.json` と `index.json` は画像より短いキャッシュにする。
- [ ] Distribution IDと標準ドメインをOutputする。

確認:

- [ ] CloudFront標準URLでSPAを取得できる。
- [ ] HTTPアクセスがHTTPSへredirectされる。
- [ ] APIレスポンスがキャッシュされない。

### 3.6 SPA routing

- [ ] CloudFront Functionを作成する。
- [ ] デフォルトBehaviorのviewer requestだけに関連付ける。
- [ ] `/login`、`/work/...`、`/viewer/...` を `/index.html` へrewriteする。
- [ ] 静的assetパスをrewriteしない。
- [ ] `/manga/*` と `/api/*` をrewriteしない。
- [ ] Distribution全体の403を200へ変換する設定は使用しない。

確認:

- [ ] SPA routeの直接アクセスが200になる。
- [ ] 未認証の `/manga/test.webp` が200へ変換されない。

### 3.7 Public Key / Key Group

- [ ] RSA鍵ペアの作成手順を決める。
- [ ] 秘密鍵をGit管理対象外にする。
- [ ] 公開鍵をCloudFront Public Keyへ登録する。
- [ ] Public KeyをKey Groupへ登録する。
- [ ] `/manga/*` BehaviorにTrusted Key Groupを設定する。
- [ ] Legacy Trusted Signerを使用しない。

### 3.8 API Gateway HTTP API

- [ ] REST APIではなくHTTP APIを作成する。
- [ ] Lambda proxy integrationを構成する。
- [ ] `/api/login` routeを作成する。
- [ ] `/api/logout` routeを作成する。
- [ ] `/api/admin/login` routeを作成する。
- [ ] `/api/admin/logout` routeを作成する。
- [ ] `/api/upload/presign` routeを作成する。
- [ ] `/api/upload/complete` routeを作成する。
- [ ] CloudFront経由の同一オリジン利用を基本にする。
- [ ] execute-api URL経由でも管理認証を迂回できないことを保証する。

### 3.9 SSM Parameter Store連携

- [ ] Parameter名だけをCDK設定として持つ。
- [ ] 閲覧パスワード導出値のSecureStringを準備する。
- [ ] 管理パスワード導出値のSecureStringを準備する。
- [ ] CloudFront秘密鍵のSecureStringを準備する。
- [ ] 管理Cookie署名鍵のSecureStringを準備する。
- [ ] Lambda roleへ対象Parameterだけの `ssm:GetParameter` を許可する。
- [ ] 必要な場合のみ対象KMS decrypt権限を付与する。
- [ ] 値そのものをCloudFormation Outputへ出さない。

### 3.10 独自ドメインの任意対応

- [ ] 独自ドメイン設定がない場合はRoute 53とACMを作らない。
- [ ] 設定がある場合だけCloudFront `domainNames` とcertificateを設定する。
- [ ] CloudFront証明書が `us-east-1` に必要なことをREADMEへ記載する。
- [ ] XSERVERからRoute 53へのNS委任手順をREADMEへ記載する。
- [ ] 既存外部DNSを使う場合のCNAME/Alias相当の設定を説明する。

## 4. バックエンド実装

### 4.1 共通基盤

- [x] API成功レスポンス形式を統一する。
- [x] APIエラーレスポンス形式を統一する。
- [x] JSON bodyのサイズと型を検証する。
- [x] password、private key、presigned URLをログ出力しない。
- [x] Lambdaのログ保持期間を短めに設定する。
- [x] SSM値を実行環境内で安全にキャッシュする。
- [x] 入力値のUnicode、長さ、許可文字を定義する。

### 4.2 閲覧ログイン

- [x] `POST /api/login` handlerを作成する。
- [x] request bodyからpasswordを取得する。
- [x] 不正JSONと空passwordを400にする。
- [x] SSMから閲覧パスワード導出値を取得する。
- [x] `scrypt` 等で入力passwordを導出する。
- [x] `timingSafeEqual` で比較する。
- [x] 不一致は詳細を漏らさず401にする。
- [x] SSMからCloudFront秘密鍵を取得する。
- [x] CloudFront Custom Policyを生成する。
- [x] Resourceを現在の正規サイトURLの `/manga/*` に限定する。
- [x] 有効期限を設定値から計算する。
- [x] Signed Cookie 3個を生成する。
- [x] `Secure; HttpOnly; SameSite=Lax; Path=/` を設定する。
- [x] 成功時に200を返す。

テスト:

- [x] 正しいpasswordで200になる。
- [x] 間違ったpasswordで401になる。
- [x] passwordがログへ出ない。
- [x] Cookie 3個が返る。
- [x] PolicyのResourceが `/manga/*` だけである。
- [x] Policyの期限が設定どおりである。
- [x] 不正viewer hostを利用できない。

### 4.3 閲覧ログアウト

- [x] `POST /api/logout` handlerを作成する。
- [x] Signed Cookie 3個を同じ属性で期限切れにする。
- [x] 冪等に200を返す。

テスト:

- [x] 3個すべてに過去のExpiresまたはMax-Age=0が設定される。
- [x] Cookieなしでも安全に成功する。

### 4.4 管理ログイン

- [x] `POST /api/admin/login` handlerを作成する。
- [x] 閲覧用とは別の管理passwordを検証する。
- [x] 有効期限とnonceを持つsession payloadを作る。
- [x] SSMの管理署名鍵でHMAC署名する。
- [x] HttpOnly管理Cookieを返す。
- [x] Cookie名、Path、有効期限を定数化する。
- [x] 管理ログイン試行に簡潔な防御を設ける。

テスト:

- [x] 正しい管理passwordでCookieが返る。
- [x] 閲覧passwordでは管理ログインできない。
- [x] payload改ざんを拒否する。
- [x] 期限切れを拒否する。
- [x] 異なる署名鍵のCookieを拒否する。

### 4.5 管理認証middleware

- [x] Cookie parserを作成する。
- [x] HMACをtiming-safeに検証する。
- [x] session用途がadminであることを検証する。
- [x] expiryを検証する。
- [x] Presignとcomplete handlerから共通利用する。
- [x] 未認証または無効な管理Cookieを401として扱う。

### 4.6 S3 Key検証

- [x] `workId` と `chapterId` の許可形式を定義する。
- [x] page filenameの許可形式を定義する。
- [x] `..`、slash、backslash、control characterを拒否する。
- [x] S3 Keyはサーバー側で組み立てる。
- [x] Clientが任意のBucket keyを指定できないようにする。
- [x] 保存先を `manga/{workId}/{chapterId}/{page}.webp` に限定する。
- [x] content typeを `image/webp` に限定する。

### 4.7 作品一覧・削除API

- [x] 管理認証必須の作品一覧APIを実装する。
- [x] 検証済み`workId`のprefixだけを作品単位で削除する。
- [x] S3 paginationと1,000件単位の一括削除に対応する。
- [x] ETag条件付き更新と競合再試行で公開indexから作品を除外する。
- [x] 作品画像と公開indexのCloudFront cacheを無効化する。
- [x] 同じ削除要求を安全に再試行できるよう冪等にする。

テスト:

- [x] path traversal相当入力を拒否する。
- [x] 不正拡張子を拒否する。
- [x] 過大batchを拒否する。
- [x] 正常値から期待するkeyが生成される。

### 4.7 Presigned URL API

- [x] `POST /api/upload/presign` handlerを作成する。
- [x] 管理Cookieを検証する。
- [x] batch上限を100件程度にする。
- [x] request schemaを検証する。
- [x] 短時間有効なPUT URLを生成する。
- [x] Content-Type条件を一致させる。
- [x] responseへkeyとupload URLを返す。
- [x] URLをログ出力しない。
- [x] Lambda roleのPutObject権限を漫画prefixに限定する。

テスト:

- [x] 未認証を拒否する。
- [x] 改ざん管理Cookieを拒否する。
- [x] 101件以上等の過大batchを拒否する。
- [x] 有効期限が設定範囲内である。
- [ ] URLでS3へWebPをPUTできる。
- [ ] 許可外keyへPUTできない。

### 4.8 Upload完了API

- [x] `POST /api/upload/complete` handlerを作成する。
- [x] 管理Cookieを検証する。
- [x] work/chapter/page情報を再検証する。
- [x] 必要に応じてS3 objectの存在を確認する。
- [x] 全成功時だけ公開用 `metadata.json` を書く。
- [x] metadataを確定後に `manga/index.json` を更新する。
- [x] metadataとindexに短いCache-Controlを付ける。
- [x] 画像には長いCache-Controlを付ける方式を決める。
- [x] index更新競合にETag条件付き書き込みと再試行を使う。
- [x] 不完全uploadを公開済みにしない。

テスト:

- [x] 画像不足時にcompleteを拒否する。
- [x] 正常時にmetadataが生成される。
- [x] indexへ作品が追加・更新される。
- [x] 競合時に既存作品を消さない。
- [x] 同じcomplete requestの再送が安全である。

## 5. フロントエンド実装

### 5.1 既存Frontend整理

- [x] 既存画面とcomponentを確認する。
- [x] 不要な仮実装を特定する。
- [x] Vue Router routeを整理する。
- [x] Pinia store構成を整理する。
- [ ] API clientを1か所へ集約する。
- [x] `credentials: 'include'` を使用する。
- [x] build時にsecretを埋め込まない。

### 5.2 閲覧ログイン画面

- [x] password入力とログインbuttonを実装する。
- [x] Enter keyでsubmitできるようにする。
- [x] 送信中の多重submitを防ぐ。
- [x] 401を「パスワードが違います」と表示する。
- [x] network errorを区別する。
- [x] 成功後に元のrouteまたは作品一覧へ遷移する。
- [x] passwordをstoreやlocalStorageへ保存しない。

### 5.3 認証状態とログアウト

- [x] Signed Cookie自体をJavaScriptから読まない設計にする。
- [x] private metadataの取得結果で認証切れを判定する。
- [x] 401/403時にログイン画面へ誘導する。
- [x] Logout buttonを実装する。
- [x] logout成功後にFrontendの状態を破棄する。

### 5.4 管理ログイン・管理route

- [x] `/admin/login` を実装する。
- [x] `/admin` を管理menuとして実装する。
- [x] 漫画アップロード画面を`/admin/upload`へ分離する。
- [x] 閲覧ログインと管理ログインを明確に分ける。
- [x] 管理CookieをJavaScriptから読まない。
- [x] Presignの401/403で管理ログインへ誘導する。
- [x] Admin logoutを実装する。

### 5.5 Directory Drag & Drop

- [x] 作品フォルダを一度だけdropできる領域を作る。
- [x] `DataTransferItem` と `webkitGetAsEntry` を使った再帰走査を実装する。
- [x] 必要に応じてfolder picker fallbackを用意する。
- [x] 作品直下をchapter folderとして解釈する。
- [x] chapter直下をpage imageとして解釈する。
- [x] 想定外の深さを検出する。
- [x] JPEG/PNG以外を除外またはエラー表示する。
- [x] 0 chapter、0 pageを拒否する。
- [x] 10,000件をDOMへ無制限表示しない。

テスト:

- [x] 50 chapter × 200 imagesを解析できる。
- [x] folder hierarchyを保持できる。
- [x] 無関係ファイルを適切に扱える。

### 5.6 作品削除画面

- [x] Upload画面と分離した`/admin/delete`を実装する。
- [x] 公開中の作品一覧と削除操作を表示する。
- [x] 作品名と不可逆性を示す確認modalを表示する。
- [x] 削除処理中のbutton無効化とhandler guardで二重送信を防ぐ。
- [x] 管理session切れでは管理loginへ戻す。

### 5.7 Local deploy console

- [x] local開発時かつ`localhost`/`127.0.0.1`だけで表示する`/local/deploy`画面を実装する。
- [x] `127.0.0.1` bind、接続元/Host/Origin確認を行うlocal runnerを実装する。
- [x] Browserから任意commandを受け取らず、Backend Lambda更新とFrontend配信だけを固定jobとして実行する。
- [x] Backend jobではCloudFormationを使わず、既存Lambdaのコードだけを更新する。
- [x] Frontend jobではbuild、Frontend Bucket upload、CloudFront invalidationだけを実行する。
- [x] 対象AWS accountを検証し、別accountへの実行を拒否する。
- [x] SSEで実行logと状態を表示し、同時実行を1件に制限する。
- [x] 巨大入力でも画像decodeを開始しない段階ではメモリが急増しない。

### 5.6 Natural Sortと正規化

- [x] Natural Sort utilityを実装する。
- [x] chapter名を自然順に並べる。
- [x] page名を自然順に並べる。
- [x] 表示名と内部IDを分離する。
- [x] chapter IDをzero paddingする。
- [x] page filenameをzero paddingする。
- [x] work slug生成ルールを実装する。
- [ ] slug重複時の扱いを決める。

テスト:

- [x] `1.jpg, 2.jpg, 10.jpg` が `1, 2, 10` になる。
- [x] `1巻, 2巻, 10巻` が自然順になる。
- [x] `001.webp` 形式へ正規化される。
- [x] 日本語表示名がmetadataに保持される。

### 5.7 Upload前プレビュー

- [x] 作品名を表示する。
- [x] chapter数を表示する。
- [x] 画像総数を表示する。
- [x] 元データ総容量を表示する。
- [x] chapter別page数を表示する。
- [x] 警告と解析エラーを表示する。
- [x] WebP qualityを設定できるようにする。
- [x] Upload開始前にユーザーが内容を確認できるようにする。

### 5.8 WebP変換

- [x] JPEG/PNGを1件ずつdecodeする。
- [x] Canvasまたは適切なBrowser APIでWebP Blobを生成する。
- [x] quality設定を反映する。
- [x] 元画像の向きと寸法を保持する。
- [x] 変換失敗をファイル単位で記録する。
- [x] 処理後にobject URL、bitmap、canvas、Blob参照を解放する。
- [ ] 極端な画質劣化がないサンプル確認を行う。
- [x] メインスレッド停止が問題になる場合だけWeb Workerを導入する。

### 5.9 Upload queue

- [x] queue state modelを作成する。
- [x] `pending/converting/uploading/succeeded/failed` を管理する。
- [x] 並列数を定数または設定値にする。
- [x] Presigned URLをbatch単位で取得する。
- [x] 変換後ただちにPUTする。
- [x] PUT完了後ただちにBlob参照を解放する。
- [x] 10,000件分のWebP Blobを保持しない。
- [x] Pauseを実装する。
- [x] 同一セッション内Resumeを実装する。
- [x] failed itemだけのRetryを実装する。
- [x] Retry時に対象画像だけ再変換する。

テスト:

- [x] concurrency上限を超えない。
- [x] Pause後に新規処理が開始されない。
- [x] Resumeで残りから再開する。
- [x] failed itemだけ再試行される。
- [x] 10,000件相当でも全画像を同時decodeしない。

### 5.10 Upload progress

- [x] 全ファイル数を表示する。
- [x] 変換済み数を表示する。
- [x] Upload済み数を表示する。
- [x] 失敗数を表示する。
- [x] 現在のchapter/pageを表示する。
- [x] 全体progressを表示する。
- [x] 元容量、変換後容量、圧縮率を表示する。
- [x] 完了後に成功・失敗summaryを表示する。
- [x] Retry failed files buttonを表示する。

### 5.11 metadata確定

- [x] 全画像成功時だけcomplete APIを呼ぶ。
- [x] 一部失敗時はcomplete APIを呼ばない。
- [x] complete失敗と画像PUT失敗を区別する。
- [x] complete APIの安全な再試行を実装する。
- [x] 完了後に作品ページへの導線を表示する。

### 5.12 作品一覧・詳細

- [x] privateな `/manga/index.json` を取得する。
- [x] 作品一覧を表示する。
- [x] coverがある場合だけ表示する。
- [x] 作品詳細でchapter一覧を表示する。
- [x] chapterをNatural Sort済みmetadata順に表示する。
- [x] metadata取得401/403を認証切れとして扱う。
- [x] metadata破損とnetwork errorを区別する。

### 5.13 Viewer

- [x] metadataのpage数から画像URLを組み立てる。
- [x] 1万件分URLをAPIから取得しない。
- [x] chapter内ページを縦スクロール表示する。
- [x] `loading="lazy"` またはIntersectionObserverを使う。
- [ ] 現在位置周辺を先読みする。
- [x] 同時decode数を抑える。
- [x] 前chapter、次chapterを実装する。
- [x] chapter先頭への遷移を実装する。
- [x] 画像403時に認証切れを案内する。
- [x] 画像404とnetwork errorを区別する。

## 6. セキュリティ確認

- [x] S3 Public Accessが完全に無効である。
- [x] S3 direct URLが403になる。
- [x] 未ログインの `/manga/*` が403になる。
- [x] ログイン後だけ `/manga/*` が200になる。
- [ ] Signed Cookie期限切れ後に403へ戻る。
- [x] 未認証でPresign URLを取得できない。
- [x] 閲覧Cookieだけでは管理APIを呼べない。
- [x] path traversal入力を拒否する。
- [x] 任意S3 KeyへのPresignを発行しない。
- [x] secretがGit履歴、Frontend bundle、source mapにない。
- [x] password、private key、presigned URLがログにない。
- [x] IAM policyが対象Bucket/prefix/actionに限定されている。
- [x] CORSで `AllowedOrigins: *` を使用していない。
- [x] APIレスポンスに不要な内部情報を含めない。

上記の未完了項目はdeploy後の実AWS E2Eで確認する。ローカルtestとsynthで検証できる項目は完了済み。

## 7. コスト確認

- [x] NAT Gatewayが存在しない。
- [x] ALB、EC2、ECS、Fargateが存在しない。
- [x] RDS、Aurora、DynamoDBが存在しない。
- [x] Secrets Managerを無条件に使用していない。
- [x] WAFを必須リソースとして作っていない。
- [x] Route 53とACMは独自ドメイン有効時だけ作る。
- [x] 不要なS3 versioning、access log、CloudFront logを有効にしない。
- [x] CloudWatch Logsの保持期間を明示する。
- [x] CloudFrontの料金プランとpay-as-you-goを比較する。
- [x] 画像数・平均サイズ・月間閲覧量別の概算をREADMEへ記載する。
- [x] 料金が発生し得る全リソースをREADMEへ列挙する。

## 8. README・運用手順

- [x] architecture図を記載する。
- [x] local development手順を記載する。
- [x] Node.jsとAWS CLIの前提を記載する。
- [x] CDK bootstrap手順を記載する。
- [x] SSM SecureString登録手順を記載する。
- [x] CloudFront key pair作成手順を記載する。
- [x] frontend build手順を記載する。
- [x] CDK deploy手順を記載する。
- [x] 初回CORS設定手順を記載する。
- [x] 漫画folder upload手順を記載する。
- [x] 作品削除手順と復元できない旨を記載する。
- [x] 独自ドメインなしのアクセスURL確認方法を記載する。
- [x] 任意の独自ドメイン追加手順を記載する。
- [x] XSERVERからRoute 53へのNS委任手順を記載する。
- [x] `cdk destroy` 時に漫画Bucketが残ることと注意点を記載する。
- [x] 保持されたBucketを手動削除する危険性を記載する。
- [x] backupが別途必要であることを記載する。

## 9. Phase別完了条件

### Phase 1: CDK / S3 / CloudFront / SPA

- [x] CloudFront標準URLでSPAを表示できる。
- [x] SPA routeを直接開ける。
- [x] SPA BucketをS3 URLで直接閲覧できない。
- [x] 禁止された固定料金リソースがない。

### Phase 2: Signed Cookie / Login

- [x] 未ログインの `/manga/*` 画像が403になる。
- [x] 正しい共通passwordでログインできる。
- [x] ログイン後のsample画像が200になる。
- [ ] Cookie期限切れ後に403になる。
- [x] 漫画BucketのS3 URLは常に403になる。

### Phase 3: Admin / D&D / Natural Sort / WebP

- [ ] 作品folderを一度だけD&Dできる。
- [ ] 50 chapter × 200 imagesを解析できる。
- [ ] Natural Sortが正しい。
- [ ] WebP変換をqueue処理できる。
- [ ] 全画像を同時decodeしない。

### Phase 4: Presigned PUT / Progress / Retry

- [ ] 未認証でPresignを取得できない。
- [ ] 画像binaryがLambdaを通らない。
- [x] BrowserからS3へ直接PUTできる。
- [ ] progressが表示される。
- [ ] Pause、Resume、Retry failed filesが動作する。

### Phase 5: metadata / 一覧 / Viewer

- [x] 全画像成功後だけmetadataが公開される。
- [x] 作品一覧を表示できる。
- [x] chapter一覧を表示できる。
- [x] Viewerで漫画を読める。
- [ ] 前後chapterへ移動できる。
- [ ] Lazy LoadでBrowser負荷を抑えられる。

### Phase 6: 品質・運用

- [x] BackendとFrontendの必須テストが成功する。
- [ ] セキュリティ確認項目を満たす。
- [x] コスト確認項目を満たす。
- [x] READMEだけで初回構築と運用が可能である。
- [x] `cdk destroy` で漫画画像を誤削除しない。

セキュリティ確認の残りはdeploy後の実AWS E2Eのみ。deploy前に実施できるPhase 6作業は完了済み。

## 10. 実装開始時の最初の作業

1. 現在の `frontend` をbuild・testし、既存状態を記録する。
2. ルートとFrontendの依存関係・Node.jsバージョンを確認する。
3. `infra` と `backend` の最小TypeScript構成を作る。
4. CDK v2のインストール済み型定義でOAC、Distribution、Key Group APIを確認する。
5. SPA Bucket、漫画Bucket、CloudFront Distributionだけをsynthする。
6. synth結果を確認してからPhase 1のdeployへ進む。
