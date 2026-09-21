# Private Manga Viewer

少人数（4〜5人）だけで使う、AWS上のプライベート漫画閲覧サイトです。作品folderを管理画面へ一度dropすると、Browser内でJPEG/PNGをWebPへ変換し、S3へ直接uploadします。DB、Cognito、常時稼働serverは使用しません。

## Architecture

```text
Viewer Browser
  ├─ SPA / API ───────────────> CloudFront ──> S3 (Frontend)
  │                                  └───────> API Gateway HTTP API ──> Lambda
  └─ /manga/* + Signed Cookie ─> CloudFront ──OAC──> S3 (Manga, private/RETAIN)

Admin Browser
  ├─ 管理Cookie ─> Presign Lambda ─> 15分有効のPresigned PUT URL
  ├─ WebP Blob ───────────────────────────────────────────────> S3
  └─ 全PUT成功 ─> Complete Lambda ─> metadata.json / index.json

Secrets: SSM Parameter Store Standard SecureString
```

主なAWS resourceはS3 Bucket 2個、CloudFront Distribution/OAC/Key Group、API Gateway HTTP API、Lambda、IAM Role、CloudWatch Logsです。漫画BucketはPublic Accessを完全にblockし、`RemovalPolicy.RETAIN`でStack削除から保護します。

## 前提

- Windows PowerShell
- Node.js 24.18.0（`.nvmrc`）
- npm
- AWS CLI v2
- AWS credentialsまたはAWS IAM Identity Centerの有効なprofile
- OpenSSL（CloudFront RSA鍵生成用）
- deploy先region: `ap-northeast-1`

Node.jsとAWS接続を確認します。

```powershell
node --version
aws --version
aws sts get-caller-identity
```

AWS account IDやsecret access keyをsource、`.env`、READMEへ記入しないでください。

## Installとlocal確認

```powershell
cd D:\manga\backend
& 'C:\Program Files\nodejs\npm.cmd' ci

cd D:\manga\frontend
& 'C:\Program Files\nodejs\npm.cmd' ci

cd D:\manga\infra
& 'C:\Program Files\nodejs\npm.cmd' ci
```

Frontendだけを起動する場合:

```powershell
cd D:\manga\frontend
& 'C:\Program Files\nodejs\npm.cmd' run dev
```

`http://localhost:4646`で画面を確認できます。Local serverにはLambda/API/S3のemulatorを含まないため、ログイン・Presign・private metadata取得のE2E確認はdeploy後に行います。

全local検証:

```powershell
cd D:\manga\backend
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
& 'C:\Program Files\nodejs\npm.cmd' run test

cd D:\manga\frontend
& 'C:\Program Files\nodejs\npm.cmd' run type-check
& 'C:\Program Files\nodejs\npm.cmd' run test
& 'C:\Program Files\nodejs\npm.cmd' run lint
& 'C:\Program Files\nodejs\npm.cmd' run build

cd D:\manga\infra
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
& 'C:\Program Files\nodejs\npm.cmd' run test
& 'C:\Program Files\nodejs\npm.cmd' run synth
```

`synth`はAWS resourceを変更しません。`cdk.out`はGit無視済みです。

## 認証情報の生成

閲覧用passwordと管理用passwordは必ず別にします。次のscriptはpasswordを非表示で入力し、平文をfileやcommand line引数へ保存せず、Backendが読むscrypt形式へ変換します。同時に管理Cookie署名鍵とCloudFront RSA鍵も生成します。

```powershell
cd D:\manga
& .\scripts\prepare-secrets.ps1
```

生成先はGit無視済みの`D:\manga\secrets`です。

```text
viewer-password-hash.txt
admin-password-hash.txt
admin-signing-key.txt
cloudfront-private.pem
cloudfront-public.pem
```

`cloudfront-private.pem`を失うと既存構成でSigned Cookieを新規発行できません。暗号化した別媒体へbackupしてください。Passwordの平文は保存しません。

## SSM SecureString登録

deploy前に4件を同じregionへ登録します。Standard tierを明示し、追加料金が発生するAdvanced parameterを使いません。

```powershell
cd D:\manga
$region = 'ap-northeast-1'

aws ssm put-parameter --region $region --name /manga/viewer-password-hash --type SecureString --tier Standard --value file://secrets/viewer-password-hash.txt --overwrite
aws ssm put-parameter --region $region --name /manga/admin-password-hash --type SecureString --tier Standard --value file://secrets/admin-password-hash.txt --overwrite
aws ssm put-parameter --region $region --name /manga/admin-signing-key --type SecureString --tier Standard --value file://secrets/admin-signing-key.txt --overwrite
aws ssm put-parameter --region $region --name /manga/cloudfront-private-key --type SecureString --tier Standard --value file://secrets/cloudfront-private.pem --overwrite
```

名前だけを確認します。値をterminalへ表示しないでください。

```powershell
aws ssm describe-parameters --region $region --parameter-filters Key=Name,Option=BeginsWith,Values=/manga/ --query 'Parameters[].Name'
```

Lambdaは実行時にSecureStringを復号し、warm container内へcacheします。値をrotationした直後は、古いLambda containerが破棄されるまで旧値を使う場合があります。

## CDK bootstrap

account/regionごとに初回だけ実行します。これはAWS resourceを作るため、account IDを必ず確認してから手動で実行してください。

```powershell
$accountId = aws sts get-caller-identity --query Account --output text
cd D:\manga\infra
& 'C:\Program Files\nodejs\npm.cmd' exec cdk -- bootstrap "aws://$accountId/ap-northeast-1"
```

本リポジトリでは自動実行しません。

## Deploy

CloudFront標準domainは初回作成後に決まります。S3 Upload CORSへ`*`を設定しないため、deployは2段階です。

### 1. 初回deploy

```powershell
cd D:\manga\infra
$publicKeyPem = Get-Content -LiteralPath ..\secrets\cloudfront-public.pem -Raw
$env:NODE_OPTIONS = '--use-system-ca'
& 'C:\Program Files\nodejs\npm.cmd' run deploy -- --parameters "CloudFrontPublicKeyPem=$publicKeyPem"
```

完了後、CloudFormation outputの`SiteUrl`、`MangaBucketName`、`DistributionId`を控えます。

```powershell
$siteUrl = aws cloudformation describe-stacks --region ap-northeast-1 --stack-name MangaStack --query "Stacks[0].Outputs[?OutputKey=='SiteUrl'].OutputValue" --output text
$siteUrl
```

### 2. Upload CORSをCloudFront originへ限定

```powershell
cd D:\manga\infra
$publicKeyPem = Get-Content -LiteralPath ..\secrets\cloudfront-public.pem -Raw
& 'C:\Program Files\nodejs\npm.cmd' run deploy -- --parameters "CloudFrontPublicKeyPem=$publicKeyPem" --parameters "UploadAllowedOrigin=$siteUrl"
```

2回目が終わるまで、CloudFrontからのBrowser direct uploadはCORSで失敗します。以後のFrontend更新も同じ2つのparameterを渡してdeployします。漫画画像はFrontend buildやCDK assetへ含めません。

## 漫画Upload

1. `SiteUrl/admin/login`を開く。
2. 管理用passwordでログインする。
3. 作品folderを一度dropする。
4. 作品名、chapter数、page数、容量、警告を確認する。
5. 必要ならWebP qualityを変更し、「WebP変換・Upload開始」を押す。
6. 失敗があれば`Retry failed files`を押す。Pause/Resumeは同一Browser session内で利用できる。
7. 全画像成功後、BackendがS3上の画像を再確認して`metadata.json`と`index.json`を確定する。
8. 「作品ページを開く」から閲覧を確認する。閲覧用passwordでのログインは管理認証とは別に必要。

Folder構造:

```text
作品名/
  1巻/
    1.jpg
    2.jpg
  2巻/
    1.png
```

JPEG/PNG以外や深すぎる階層は警告またはエラーになります。画像はNatural Sort後に`001.webp`形式へ正規化されます。

## Deploy後の必須確認

次は実AWSでのみ確認できます。

- CloudFront標準URLでSPAと直接指定したSPA routeを開ける。
- 未ログインの`/manga/index.json`が403になる。
- 閲覧passwordでログイン後、`/manga/index.json`と漫画画像が200になる。
- 閲覧Cookie期限切れ後に403へ戻る。
- Manga BucketのS3 object URLは常に403になる。
- 閲覧Cookieだけでは`/api/upload/presign`と`/api/upload/complete`を呼べない。
- 管理ログイン後だけPresigned URLを取得できる。
- BrowserからS3へ直接PUTでき、画像binaryがLambda requestへ含まれない。
- 画像不足時はcomplete APIが409になり、作品一覧へ公開されない。
- 作品一覧、chapter一覧、Viewer、前後chapter移動、Lazy Loadが動く。
- CloudWatch Logsへpassword、秘密鍵、Cookie、Presigned URLが出ていない。

## 独自domain

現在のCDKは追加料金とDNS作業を必須にしないため、CloudFront標準domainを正規URLとして構築します。独自domainはまだ自動作成しません。

追加する場合は、CloudFront用ACM certificateを`us-east-1`で発行し、Distributionへcertificate/domain nameを設定してからDNSをCloudFrontへ向けます。XSERVER DNSを維持するならCNAME等をXSERVER側へ設定します。Route 53 Hosted Zoneへ移管する場合だけ、XSERVERのdomain管理画面でRoute 53が発行したNSへ委任します。独自domain化ではSigned Cookie policyと`UploadAllowedOrigin`も新domainへ変わるため、CDK実装と再テストを先に行ってください。

## Destroy、保持、backup

```powershell
cd D:\manga\infra
& 'C:\Program Files\nodejs\npm.cmd' exec cdk -- destroy MangaStack
```

`cdk destroy`はFrontend BucketやCloudFront等を削除しますが、Manga Bucketは`RETAIN`されます。Stack削除後はCloudFront経由で読めなくなっても、漫画object自体は残ります。

重要:

- RETAINはbackupではありません。誤操作、account障害、credential漏洩には別backupが必要です。
- S3 Versioningはコスト抑制のため無効です。上書き・手動削除から復元できません。
- 元JPEG/PNGまたは別のbackupを、AWS accountとは別の安全な場所に保持してください。
- 保持されたBucketを手動削除すると漫画画像は復元できません。Bucket名と中身を確認せず削除しないでください。
- 再構築時は保持Bucketを新Stackへ自動再接続しません。import/migration計画を立ててから操作してください。

## Security

- S3 Public Access Block、S3 managed encryption、HTTPS強制、CloudFront OACを使用。
- `/manga/*`はTrusted Key Groupと24時間のSigned Cookieで保護。
- 管理側は別passwordと1時間のHttpOnly HMAC Cookieを使用。
- Presigned PUTは15分、`image/webp`、検証済み`manga/{work}/{chapter}/{page}`だけ。
- Complete Lambdaは画像を上書き・削除できず、metadata/indexだけを書ける。
- APIはCloudFront経由の同一originで使い、S3 CORSは指定originのPUTと必要headerだけ。
- Lambda source map、S3/CloudFront access log、Frontend source mapは無効。
- Lambda logは7日保持し、secretやPresigned URLを出力しない。
- WAF、NAT Gateway、VPC、Cognito、DB、Secrets Managerは追加していない。

認証は少人数サイト向けの共通passwordです。利用者別失効、監査、MFAが必要になった場合はCognito等を別途検討してください。

## Cost

料金はregion、契約、無料枠、為替、税で変わります。以下は2026-09-21時点の概算で、AWS Pricing Calculatorによるdeploy前の再確認が必要です。

主な課金対象:

- S3 Standard: 漫画・Frontendの保存容量、PUT/GET/LIST
- CloudFront: Internetへの転送量とHTTPS request
- API Gateway HTTP API: API request
- Lambda: requestと実行時間
- CloudWatch Logs: 取り込みと7日間の保存
- SSM Parameter Store: Standard parameter/standard throughputは追加料金なし
- CDK bootstrap asset BucketとECR（保存量がある場合）

固定時間課金のNAT Gateway、ALB、EC2、ECS/Fargate、RDS/Aurora、DynamoDB、ElastiCache、OpenSearch、WAFは作りません。S3 Versioning、S3 access log、CloudFront access logも無効です。

概算例（S3 Standard東京を約`$0.025/GB-month`、CloudFront日本向け従量転送を上限側の約`$0.114/GB`として、request料金・税・無料枠を除外）:

|  画像数 | 平均WebP | 保存容量概算 |   S3/月 | CloudFront転送/月 | 転送概算/月 |
| ------: | -------: | -----------: | ------: | ----------------: | ----------: |
|  10,000 |   200 KB |     約1.9 GB | 約$0.05 |             10 GB |     約$1.14 |
|  10,000 |   500 KB |     約4.8 GB | 約$0.12 |             50 GB |     約$5.70 |
| 100,000 |   500 KB |    約47.7 GB | 約$1.19 |            100 GB |    約$11.40 |

CloudFrontには月額`$0`の定額Free plan（100 GB転送、100万request等を含む）が案内されています。一方、現在のCDKはplan加入を自動化せず通常の従量制resourceを作ります。小規模利用ではFree plan/無料枠が有利な可能性がありますが、適用条件とaccount状態をAWS Consoleで確認してから選択してください。転送量が少なければ従量制も固定費なしで運用できます。

公式料金:

- [Amazon CloudFront pricing](https://aws.amazon.com/jp/cloudfront/pricing/)
- [Amazon S3 pricing](https://aws.amazon.com/jp/s3/pricing/)
- [Amazon API Gateway pricing](https://aws.amazon.com/api-gateway/pricing/)
- [AWS Lambda pricing](https://aws.amazon.com/lambda/pricing/)
- [AWS Systems Manager pricing](https://aws.amazon.com/systems-manager/pricing/)
- [Amazon CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/)

Budget alertはresource自体に料金が発生する場合があるためCDKへ自動追加していません。deploy前にAWS Billingの通知先と予算設定を確認してください。

## Troubleshooting

- PowerShellで`npm.ps1`が拒否される: `C:\Program Files\nodejs\npm.cmd`を使う。
- npmで`UNABLE_TO_VERIFY_LEAF_SIGNATURE`: `$env:NODE_OPTIONS='--use-system-ca'`を設定する。
- npm cacheへ書けない: `--cache D:\manga\.npm-cache`を使う。
- `cdk synth`前にFrontend buildが必要: `infra`の`npm run synth`は自動でbuildする。
- `cdk flags`警告: synth失敗ではない。内容を確認せず大量のflagを追加しない。
- 初回deploy後にUploadだけCORS失敗: `UploadAllowedOrigin=$siteUrl`を渡した2回目deployを確認する。
- password/鍵を更新したのにすぐ反映されない: Lambda warm containerのSSM cacheを考慮する。
