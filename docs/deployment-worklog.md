# 初回deploy作業記録

作業日: 2026-09-22

この文書は、作業が途中で中断しても安全に再開できるよう、初回deployの実行内容・結果・次の作業を逐次記録する。

## 前提

- Repository: `D:\manga`
- 開始時HEAD: `97c0c02` (`ff`)
- AWS profile: `<AWS profile>`
- AWS account: `<AWS account ID>`
- Region: `ap-northeast-1`
- Node.js: `v24.18.0`
- AWS CLI: `2.31.13`
- OpenSSL: `C:\Program Files\Git\usr\bin\openssl.exe`
- 開始時worktree: clean

## 安全方針

- 漫画Bucketと既存コンテンツを削除・上書きしない。
- 既存Stack・SSM Parameter・同名リソースをread-onlyで確認してから変更する。
- `cdk destroy`、S3 object削除、既存resourceの強制置換は実行しない。
- synth/diffを確認し、想定外の高額resourceや削除・置換があればdeployを停止する。
- NAT Gateway、ALB、EC2/ECS/Fargate、RDS、DynamoDB、WAF等を追加しない。
- 初回deploy後のCORS更新は、CloudFrontの `SiteUrl` だけを許可originにして実施する。

## 進捗

### 0. ローカル状態

- [x] worktreeがcleanであることを確認
- [x] HEADとtool versionを記録
- [x] browser-check preflight

### 1. AWS事前確認

- [x] 設定済みAWS profileのcaller identityを再確認
- [x] 対象regionの既存 `MangaStack` を確認
- [x] CDK bootstrap Stackを確認
- [x] 必要なSSM Parameter 4件の存在だけを確認（値は表示しない）
- [x] 同名または既存の漫画Bucketを確認

### 2. deploy前検証

- [x] Frontend build
- [x] Backend / Frontend / Infra test
- [x] CDK synth
- [x] `cdk diff` で作成・更新・削除・置換を確認
- [x] 高額または禁止resourceが含まれないことを確認

### 3. Secretとbootstrap

- [x] Secret 5 fileをlocal生成済みか確認（内容は表示しない）
- [x] SSM SecureString 4件を登録済みか確認
- [x] CDK bootstrapが必要な場合だけ実行

### 4. 初回deploy

- [x] CloudFront Public Keyをparameterとして初回deploy
- [x] CloudFormation Stack statusを確認
- [x] `SiteUrl`、`DistributionId`、Bucket名を記録
- [x] 漫画Bucketが新規か既存かを記録

### 5. CORS限定deploy

- [x] `UploadAllowedOrigin=SiteUrl` で2回目deploy
- [x] diffに想定外の削除・置換がないことを確認
- [x] Stack statusを確認

### 6. 実AWS / Browser E2E

- [x] CloudFront標準URLでSPAを表示
- [x] 未認証 `/manga/*` が403
- [x] 閲覧ログインとprivate metadata取得
- [x] 管理ログイン
- [x] 小さなテスト作品をPresigned PUTでupload
- [x] metadata/index確定とViewer表示
- [x] S3 direct URLが403
- [x] Browser console errorと主要画面を確認
- [ ] CloudWatch Logsにsecret・Cookie・Presigned URLがないことを確認

## 実行ログ

### 2026-09-22 10:16 JST — 作業開始

- userから初回deployと実ブラウザ確認の許可を受領。
- 既存コンテンツ保護、不要な負荷・高額resourceの回避を最優先とする。
- `browser-check` skillの手順を確認済み。

### 2026-09-22 10:17 JST — Browser前提確認

- Playwright: 利用可能
- Chromium: 利用可能
- dev server: 未起動（deploy後はCloudFront URLを直接指定するため、現時点では起動不要）
- Screenshot出力先: OS一時directory

### 2026-09-22 10:18 JST — AWS read-only事前確認

- caller identity: 設定済みAWS accountとIAM userで一致
- `MangaStack`: 存在しない
- `CDKToolkit`: 存在しない
- `/manga/` SSM Parameter: 0件
- 名前に `manga` を含む既存S3 Bucket: 0件
- AWS CLIからSSMへ接続した際、端末CA不足によるSSL検証エラーが発生した。証明書検証は無効化せず、Node.js AWS SDKを `NODE_OPTIONS=--use-system-ca` で起動して同じread-only確認を完了した。
- 既存Stack/Bucket/Parameterはなく、今回の初回deployが既存漫画コンテンツを更新・削除する状況ではない。

次の作業: Secret 5 fileの生成とSSM SecureString 4件の登録。利用者が決める閲覧用・管理用passwordが必要。

### 2026-09-22 10:23 JST — Local最終検証

- Backend typecheck成功、unit test 35件成功
- Frontend type-check成功、unit test 33件成功、ESLint成功、production build成功
- Infra typecheck成功、unit test 5件成功、CDK synth成功
- 既知のVite chunk size警告だけがあり、build failureではない。
- synth templateは `ap-northeast-1` 向け。漫画Bucketの `RETAIN` を維持。

次の作業: `CDKToolkit` bootstrap。その後、Secret生成待ち。

### 2026-09-22 10:25 JST — CDK bootstrap

- `aws://<AWS account ID>/ap-northeast-1` へ標準 `CDKToolkit` を作成。
- CDK command result: `Environment ... bootstrapped`。
- 既存のapp Stackや漫画Bucketには触れていない。
- AWS CLIでの再確認は端末CA問題で失敗したため、bootstrap command自身の成功応答を記録。CloudFormation操作は以後 `NODE_OPTIONS=--use-system-ca` を設定したCDKで行う。

### 2026-09-22 10:27 JST — 初回CDK diff

- `MangaStack` は新規Stackのため、表示された差分はすべて追加（`[+]`）。削除・置換は0件。
- S3 Bucket 2個、CloudFront、HTTP API、Lambda 7個、LogGroup 7個、必要なIAM/OAC/Key GroupとFrontend deployment resourceを確認。
- NAT Gateway、VPC、EC2、ALB、ECS/Fargate、RDS、DynamoDB、WAF、Route 53、ACM、Secrets Managerは含まれない。
- 漫画Bucketはtemplate/testどおり `RETAIN`。既存manga Bucketは0件なので、新規作成になる。
- CDKは正確なreplacement情報用のread-only change setを作れずtemplate diffへfallbackしたが、新規Stackであり全resourceが追加のため、既存resource削除リスクはない。
- diff時にbootstrap asset Bucketへ小さなtemplate assetがpublishされた。漫画画像やFrontend以外の利用データは含まれない。

次の作業: 利用者がSecretを生成し、SSM SecureString 4件を登録する。その後、初回deployへ進む。

### 2026-09-22 — Password再登録方針の確認

- Secrets Managerは使用しない。SSM Parameter StoreのStandard SecureStringだけを使用する。
- 平文passwordは保存せず、password managerを正本とする。
- passwordを忘れた場合は、漫画データや鍵を変更せず、対象password hashのSSM Parameterだけを再登録できる。
- 単独のpassword再登録手順をREADMEへ追加した。

### 2026-09-22 10:35 JST — Secret検証とSSM登録

- localの5 fileが存在し、Git無視対象であることを確認。
- viewer/adminのscrypt hash形式、別hashであること、管理HMAC鍵形式を確認。
- Node.js cryptoでCloudFront秘密鍵をparseし、導出した公開鍵と保存済み公開鍵が一致することを確認。
- 次の4件をSSM Parameter Storeへ `SecureString` / `Standard` / version 1として新規登録。`Overwrite: false`を使用した。
  - `/manga/viewer-password-hash`
  - `/manga/admin-password-hash`
  - `/manga/admin-signing-key`
  - `/manga/cloudfront-private-key`
- Parameterの値はterminalや作業記録へ出力していない。
- Secrets Managerは使用していない。

次の作業: CloudFront公開鍵をparameterとして初回 `MangaStack` deploy。

### 2026-09-22 10:39 JST — 初回deployの起動方法を修正

- `npm run deploy -- --parameters ... --require-approval never` を試したが、npm scriptからCDKへ承認optionが正しく渡らず、security-sensitive変更の確認待ちで停止した。
- CloudFormationのchange set実行前に停止しており、`MangaStack` のapp resourceはまだ作成されていない。CDK bootstrap Bucketへbuild assetがpublishされたのみ。
- npmの表示では複数行の公開鍵parameterが先頭行だけに見えたため、`.cmd` / npmを経由せず、Node.jsからlocalのCDK CLIを直接起動して再試行する。
- 公開鍵は公開情報だが、以後もterminalへ全文を表示しない。

次の作業: parameterが単一引数として渡ることをlocal確認し、CDK CLI直接起動で初回deployを再実行する。

### 2026-09-22 10:46 JST — 初回deploy成功

- 公開鍵parameterが改行を含む単一引数として渡ることを、値を表示せずlocal確認した。
- 最初の直接起動はlocal `cdk.out` のlock file作成権限エラーでAWS接続前に停止。権限付きで同じcommandを再実行した。
- `MangaStack` の初回deployが成功。CDK終了code 0、deployment time 252.5秒。
- Stack ARN: `arn:aws:cloudformation:ap-northeast-1:<AWS account ID>:stack/MangaStack/<stack ID>`
- `SiteUrl`: `https://d26x2l9tcghr7u.cloudfront.net`
- `DistributionId`: `EN6UHWSB7J97W`
- `ApiEndpoint`: `https://73inf7qze0.execute-api.ap-northeast-1.amazonaws.com`
- `FrontendBucketName`: `mangastack-frontendbucketefe2e19c-bgshvibxa8sk`
- `MangaBucketName`: `mangastack-mangabucket00f24a3b-tivf8slgfz76`

次の作業: Bucket状態をread-only確認し、`UploadAllowedOrigin=SiteUrl` の2回目deployを行う。

### 2026-09-22 10:47 JST — Bucket状態確認

- Frontend Bucketはdeployment済みの23 object。全件を数えられ、truncatedではない。
- Manga Bucketは0 object。今回新規作成された空Bucketであり、既存漫画コンテンツの移動・削除・上書きはない。

次の作業: `UploadAllowedOrigin=https://d26x2l9tcghr7u.cloudfront.net` を指定したdiffを確認し、2回目deployを行う。

### 2026-09-22 10:49 JST — CORS更新前diff

- 使用中のCDK版では `diff` commandの `--parameters` は未対応で、optionは無視された。
- 現在deploy済みtemplateとlocal templateの差分は0件。削除・置換を伴うsource変更はない。
- `UploadAllowedOrigin` はCloudFormation parameter値だけの更新なのでtemplate diffには現れない。
- 2回目deployでは既定の `previous-parameters=true` を維持し、`UploadAllowedOrigin` だけを明示する。これにより初回の `CloudFrontPublicKeyPem` は既存値を保持する。

次の作業: CORS parameterだけを指定して2回目deployする。

### 2026-09-22 11:15 JST — CORS限定deploy成功

- `UploadAllowedOrigin=https://d26x2l9tcghr7u.cloudfront.net` だけを明示し、既存の公開鍵parameterは保持して更新した。
- CloudFormation eventで更新対象が `AWS::S3::Bucket MangaBucket` 1件だけであることを確認。
- Manga Bucketはin-placeで `UPDATE_COMPLETE`。削除・置換・再作成なし。
- Stackは `UPDATE_COMPLETE`、CDK終了code 0。outputsとStack ARNは初回から不変。

次の作業: 実際のBucket CORS値をread-only確認し、HTTP / 実browser動作確認へ進む。

### 2026-09-22 11:17 JST — CORS / HTTP確認

- Manga Bucketの実CORS設定をread-only取得し、次を確認。
  - Allowed origin: `https://d26x2l9tcghr7u.cloudfront.net` だけ
  - Allowed method: `PUT` だけ
  - Allowed headers: `content-type`, `cache-control`
  - Max age: 900秒
- HTTP status:
  - CloudFront `/`: 200
  - CloudFront `/login`: 200
  - CloudFront `/admin/login`: 200
  - 未認証CloudFront `/manga/index.json`: 403
  - Manga Bucket direct URL: 403
- S3 CORS preflight:
  - CloudFront origin: 200、`PUT` と必要headerだけを許可
  - `https://example.invalid`: 403、CORS response headerなし
- 実objectのPUTは行っておらず、漫画Bucket内容は変更していない。

### 2026-09-22 11:19 JST — 実Chromium / 認証拒否確認

- `browser-check` skillでCloudFrontを直接開き、確認ごとにChromiumを終了した。local dev serverは起動していない。
- `/login` と `/admin/login` は崩れなく描画され、JavaScript例外なし。
- 未認証 `/` は `/manga/index.json` の想定内403後、`/login?redirect=/` へ遷移した。
- 未認証 `/admin` はsession APIの想定内401後、`/admin/login` へ遷移した。
- 最初のroot screenshotは通信完了前の「読み込み中」だったため、4秒待って遷移完了を再確認した。実装不具合ではない。
- 固定の無効passwordでviewer/admin login APIを各1回だけ確認し、両方401 `INVALID_CREDENTIALS`。LambdaとSSM hash参照は正常。
- 最初のcurl試行はWindows引数処理でJSONが崩れて400になったため、Node.js `fetch` + `JSON.stringify` で正しいrequestを再確認した。
- screenshotはOS一時directoryにだけ保存し、repositoryには追加していない。
- 本番passwordは平文保存しておらず、こちらから参照できないため、成功login・Presigned PUT・Viewer表示は利用者によるlogin確認が必要。
- Backendのlogging箇所も再確認し、内部error時も固定messageだけでpassword、SSM値、Cookie、Presigned URLを出力しない実装になっている。CloudWatch実ログのread-only確認は未実施。

次の作業: 利用者がviewer/admin passwordで成功loginを確認し、必要なら小さなテスト作品1件だけでupload E2Eを行う。その後CloudWatch実ログを確認する。

### 2026-09-22 15:37 JST — 初回upload失敗の調査と修正

- 利用者がviewer/adminの両login成功を確認した後、localhost管理画面からsample uploadに失敗したと報告。
- `sample/sample1` の実fileを確認すると、各chapterに `1.jpg`〜`5.jpg`だけでなく `2 - コピー (3).jpg` も存在し、JPEGは実際に各6枚だった。このcopy画像は隠しfileではなく、正規画像と区別不能なため自動除外しない。
- Parserは元からJPEG/PNG以外の拡張子を除外していたが、次も明示的に除外するよう強化した。
  - dot file / dot directory
  - macOS `.DS_Store`、AppleDouble `._*.jpg`、`__MACOSX`
  - Windows `Thumbs.db`、`desktop.ini`
  - JPEG/PNG拡張子でもBrowserのMIME typeが非画像のfile
- 上記を検証するunit testを追加。Frontendは35 tests成功。
- header brandを`Novels`から`漫画`へ変更。
- localhostから実AWSを使えるよう、Viteで`/api/*`と`/manga/*`を`.env.local`指定のCloudFrontへproxyする構成を追加。
- `.env.local`はGit無視対象。公開URLだけを保存し、passwordやAWS credentialは保存しない。
- Manga Bucket CORSに本番CloudFront originと並べて`http://localhost:4646`を完全一致で追加。`*`は不使用。
- synthとdiffで、変更がManga BucketのCORS in-place更新とFrontend asset更新だけで、削除・置換がないことを確認。

### 2026-09-22 15:44 JST — 修正deployと実Browser E2E成功

- `MangaStack`更新成功、`UPDATE_COMPLETE`。Manga Bucketの削除・置換なし。
- `.password`は利用者の許可どおり1行目をviewer、2行目をadminとしてprocess内でだけ使用し、値は出力・記録していない。
- 本番CloudFrontでviewer/admin login成功。
- `http://localhost:4646`でもVite proxy経由のviewer/admin login成功。
- 失敗upload後のManga Bucketは0 objectで、partial uploadの残骸がないことを確認。
- 元sampleは変更せず、各chapterの`1.jpg`〜`5.jpg`だけをOS一時directoryへ複製し、4 chapters × 5 pagesの`sample1`をlocalhost管理画面からuploadした。
- Previewは4 chapters / 20 images / 各5 pages。20件すべてPresigned PUT成功後、metadataとindex確定成功。
- localhost Viewerで4 chapters / 各5 pages、chapter 1の画像5枚、表示errorなしを確認。
- 本番CloudFrontでも作品一覧、metadata、chapter 1の画像5枚を確認。headerは`漫画`。
- 最終S3状態は22 object（WebP 20、metadata 1、index 1）。実CORS originは本番CloudFrontとlocalhostの2件、methodはPUTだけ。
- browser-checkが起動したものではない既存dev serverを使用したため、指示どおり停止していない。各Chromiumは`finally`で終了した。

残件: CloudWatch実ログのread-only確認と、Signed Cookie期限切れの時間経過E2E。通常利用に必要なlogin・upload・閲覧経路は本番とlocalhostで確認済み。

### 2026-09-22 16:45 JST — 作品削除・30日sessionのdeploy前実装

- Uploadとは別の`/admin/delete`画面、管理認証付き作品一覧API、作品単位の削除APIを追加した。
- 削除前に作品名と不可逆性を示す確認modalを表示し、処理中は画面側のbutton無効化とhandler guardの両方で二重送信を防ぐ。
- Backendは検証済み`workId`のprefixだけをpagination付きで列挙し、最大1,000 objectずつ削除する。公開indexはETag条件付き更新と競合再試行で安全に更新する。
- 長期cache済み画像を削除後も閲覧できてしまわないよう、対象作品と`index.json`のCloudFront invalidationを追加した。再試行できるよう、存在しない有効な作品IDの削除も成功扱いにした。
- Viewer Signed Cookieと管理sessionを30日に変更し、Browser終了後も保持される`Expires`属性を追加した。Logoutでは従来どおり削除される。
- `.password`の2行構成と秘匿上の注意を`browser-check` skillへ追記し、skill validatorで正常性を確認した。
- deploy前checkはBackend 40 tests、Frontend 38 tests、Infra 5 testsが成功。各typecheckとFrontend lintも成功した。

次の作業: `cdk synth`と`cdk diff`で既存resourceの削除・置換がないことを確認し、deployする。その後、`sample1`を削除せず専用の一時作品だけで削除modal・二重送信防止・S3/index削除を実Browser確認する。

### 2026-09-22 16:50 JST — 作品削除・30日sessionのdeploy完了

- 設定済みAWS profileのcaller identityを再確認した。
- `cdk synth`成功。`cdk diff`は新規AdminWorks Lambda/API/IAM、既存認証LambdaのTTL/code、Frontend assetだけの差分で、Manga Bucketや既存resourceの削除・置換は0件だった。
- `MangaStack`を更新し、16:49 JSTに`UPDATE_COMPLETE`。Manga Bucketの更新eventはなく、名前・Distribution・outputsも不変。
- `.password`はskill記載どおりprocess内でだけ読み、値・長さ・hashを出力せず、Chromiumは`finally`で終了した。
- 本番CloudFrontでviewer loginとadmin loginに成功し、閲覧Cookie 3個と管理session Cookieがいずれも約30日の`Expires`を持つことを実Browser確認した。
- 削除E2E専用の一時作品`delete-e2e-mucdn7fa-1a7ij2f`を1画像だけuploadした。`sample1`は操作対象にしていない。
- `/admin/delete`で作品一覧、作品名と不可逆性を示す確認modalを確認。確認buttonを同期的に2回押してもDELETE requestは1回だけだった。
- 削除APIは200を返し、一時作品は画面一覧から消えた。CloudFront invalidation requestが受理されてから成功を返す経路も通過した。
- AWS SDKで最終状態をread-only確認し、一時作品prefix 0 object、`sample1` prefix 21 object、`manga/`全体22 objectだった。公開indexは一時作品なし・`sample1`あり。
- screenshotはOS一時directoryだけに保存し、repositoryには含めていない。既存dev serverは`theirs`判定のため停止していない。

作品削除・30日sessionのdeployと本番E2Eは完了。既存コンテンツの損失なし。

### 2026-09-22 — Local deploy console実装（未deploy）

- GatherModokiのlocal deploy consoleを参照し、`/local/deploy`と`frontend/scripts/local-deploy-runner.mjs`を追加した。
- Browserから実行可能なjobは固定2件だけ。Backendは既存Lambdaのコード更新だけ、Frontendはbuild・Frontend Bucket upload・CloudFront invalidationだけに限定する。
- CDK/CloudFormation、CloudFront設定、IAM、SSM、漫画Bucket、MangaStackのresource変更はrunnerから実行できない。
- runnerは`127.0.0.1:5175`だけで待受け、接続元address、Host、Vite local originを検証する。設定済みAWS account以外はjobを停止する。
- local UIとrunnerを起動する`npm run dev:deploy-console`、個別jobの`npm run deploy:backend`/`npm run deploy:frontend`を追加した。
- Frontend typecheck、lint、38 tests、production buildが成功。runnerのhealth endpointと未定義job 404、既存Vite serverへ相乗りする起動を確認した。
- Chromiumで`/local/deploy`を開き、local限定UI、runner接続、固定2ボタンを確認した。実deploy buttonは押していないため、本記録の変更は未deploy。

### 2026-09-22 — Local frontend deployのWindows spawn修正（未deploy）

- 利用者がFrontend deploy buttonを実行したところ、build開始前に`spawn EINVAL`で失敗した。S3 uploadとCloudFront invalidationは未実行。
- 原因はWindowsで`npm.cmd`をNode.js `spawnSync`へ直接渡していたこと。GatherModokiと同じ`cmd.exe /c`経由へ変更した。
- Backend bundlingも`.cmd` shimを直接spawnせず、esbuild本体をNode.jsから実行する方式へ変更した。
- Frontend typecheck、lint、38 tests成功。`cmd.exe /c npm run build`によるproduction build成功を確認した。
- 画面は失敗時に「完了しました」と表示していたため、失敗と実行log確認を明示する文言へ修正した。
- 続くBrowser再現で、runner自身が`npm.cmd`を直接spawnして`EINVAL`となっていることを確認。runnerもGatherModokiと同じ`cmd.exe /c npm run <fixed job>`方式へ修正した。
- `cmd.exe /c npm --version`のNode child process起動成功、Frontend typecheckとlint成功を確認。既に起動中のrunnerはNode processのため、この修正を反映するには利用者側でrunnerを再起動する必要がある。

### 2026-09-22 — deploy先account設定のGit管理外移動（未deploy）

- local deploy scriptsに書かれていた固定AWS account IDを削除した。
- `frontend/.env.deploy.local`（Git無視）または`MANGA_DEPLOY_ACCOUNT_ID`環境変数から12桁のaccount IDを取得して、AWS caller identityと照合する。
- `.env.deploy.local.example`は空のplaceholderだけを追跡し、実値fileがGit追跡されないことを確認した。
- Frontend lintと38 tests成功。既存runnerはjob開始時に更新済みscriptを別processで読むため、account設定変更だけならrunner再起動は不要。

### 2026-09-22 — 管理menuへの分離（未deploy）

- `/admin`を管理menuへ変更し、従来のupload画面を`/admin/upload`へ移動した。
- 管理menuからアップロード、作品削除、local環境だけのdeploy consoleへ遷移できるようにした。
- 管理session確認とlogoutは従来どおり`/admin`で維持し、productionではdeploy console linkを表示しない。
- Frontend typecheck、lint、38 tests、production buildが成功。Chromiumで管理login後のmenu、`/admin/upload`、`/admin/delete`、local deploy console linkを確認し、upload/delete/deploy操作は実行していない。

### 2026-09-22 — upload成功・失敗modalの実装（未deploy）

- `/admin/upload`の成功・失敗表示は既存の共通`Modal.vue`を使用する。overlay、×、footerの「閉じる」で閉じられる。
- 成功modalは初期非表示で、`isPublished`（全画像uploadとmetadata公開成功）時だけ開く。
- 成功・失敗modalはいずれも初期非表示で、実際の処理結果が確定した時だけ開く。
- 失敗は次の4種類を区別し、原因・対象件数・推奨操作を表示する。
  - Upload URL取得失敗: ネットワーク確認または再ログイン後、失敗画像だけ再試行
  - WebP変換失敗: まず再試行し、残る画像は元fileの破損を確認
  - S3送信失敗: ネットワーク確認後、失敗画像だけ新しいURLで再送
  - metadata確定失敗: S3確認待ちなら1分程度待ってmetadata確定だけを再試行。画像の再送は不要
- 失敗した画像の相対pathと処理段階を最大5件まで確認できる。
- Frontend typecheck、lint、41 tests成功。

### 2026-09-22 — 作品削除の結果・進行表示（未deploy）

- `/admin/delete`で削除成功時・失敗時に、共通`Modal.vue`による結果modalを表示する。
- 削除中は確認modalを閉じられないままspinnerと「削除中」を表示し、ボタン連打を防止する。
- 現行DELETE APIは完了時にだけ応答する同期APIのため、正確なobject件数や百分率は取得・表示しない。画像、metadata、公開cacheを順に処理していることだけを明示する。
- 失敗時は同じ作品の削除を再試行できる。BackendのDELETEは途中まで削除済みでも安全に再実行できる。

### 2026-09-23 — 未認証時の閲覧画面ちらつき防止（未deploy）

- `/`と`/works/:workId`は、private metadataの認証確認が終わるまで作品一覧・作品詳細の見出しや導線をDOMへ描画しない。
- 未認証の403では一般的な「認証を確認中…」だけが表示された後、そのままlogin画面へ遷移する。低速回線のスマホで「作品一覧」が一瞬見える問題を防ぐ。

### 2026-09-23 — WebP品質の初期値変更（未deploy）

- 管理画面のWebP quality初期値を0.85から0.70へ変更。必要に応じて管理者がupload前にsliderで変更できる。

## 中断時の再開手順

1. `git status --short` と本書の最後の実行ログを確認する。
2. `$env:AWS_PROFILE = '<your-aws-profile>'` を設定する。
3. `aws sts get-caller-identity` で意図したAWS accountであることを確認する。
4. 完了済み項目を再実行せず、最初の未完了チェックから再開する。
5. deploy中断時はCloudFormationのStack eventを先に確認し、同じdeployを即座に重ねない。
