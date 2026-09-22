# 初回deploy作業記録

作業日: 2026-09-22

この文書は、作業が途中で中断しても安全に再開できるよう、初回deployの実行内容・結果・次の作業を逐次記録する。

## 前提

- Repository: `D:\manga`
- 開始時HEAD: `97c0c02` (`ff`)
- AWS profile: `kudo-admin`
- AWS account: `702347290971`
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

- [x] `kudo-admin` のcaller identityを再確認
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

- [ ] Secret 5 fileをlocal生成済みか確認（内容は表示しない）
- [ ] SSM SecureString 4件を登録済みか確認
- [x] CDK bootstrapが必要な場合だけ実行

### 4. 初回deploy

- [ ] CloudFront Public Keyをparameterとして初回deploy
- [ ] CloudFormation Stack statusを確認
- [ ] `SiteUrl`、`DistributionId`、Bucket名を記録
- [ ] 漫画Bucketが新規か既存かを記録

### 5. CORS限定deploy

- [ ] `UploadAllowedOrigin=SiteUrl` で2回目deploy
- [ ] diffに想定外の削除・置換がないことを確認
- [ ] Stack statusを確認

### 6. 実AWS / Browser E2E

- [ ] CloudFront標準URLでSPAを表示
- [ ] 未認証 `/manga/*` が403
- [ ] 閲覧ログインとprivate metadata取得
- [ ] 管理ログイン
- [ ] 小さなテスト作品をPresigned PUTでupload
- [ ] metadata/index確定とViewer表示
- [ ] S3 direct URLが403
- [ ] Browser console errorと主要画面を確認
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

- caller identity: account `702347290971`、IAM user `kudo-admin` で一致
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

- `aws://702347290971/ap-northeast-1` へ標準 `CDKToolkit` を作成。
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

## 中断時の再開手順

1. `git status --short` と本書の最後の実行ログを確認する。
2. `$env:AWS_PROFILE = 'kudo-admin'` を設定する。
3. `aws sts get-caller-identity` でaccount `702347290971` を確認する。
4. 完了済み項目を再実行せず、最初の未完了チェックから再開する。
5. deploy中断時はCloudFormationのStack eventを先に確認し、同じdeployを即座に重ねない。
