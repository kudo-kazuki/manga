# Phase 1 インフラ実装 作業記録

作業日: 2026-09-21

- 実施日: 2026-09-21
- 作業時間帯: 17:00～17:30頃（JST）
- 対象Phase: Phase 1「CDK / S3 / CloudFront / SPA」のうち、ローカルで実施できる実装とsynth確認
- 参照文書:
    - [`specification.md`](./specification.md)
    - [`invatigate-20260921164910.md`](./invatigate-20260921164910.md)
    - [`planning.md`](./planning.md)
- AWS環境への変更: なし

## 1. 今回の目的

`planning.md` に沿って `infra/` の実装を開始し、Phase 1の基礎となるS3、CloudFront、OAC、SPA配信構成をAWS CDK v2とTypeScriptで定義する。

今回はユーザーの指示によりデプロイを行わず、型チェック、テスト、Frontend build、`cdk synth`によるCloudFormationテンプレート生成までを確認範囲とした。

## 2. 実施したこと

### 2.1 リポジトリとFrontendの事前確認

- `.nvmrc`、`.gitignore`、Frontendの依存関係とscriptを確認した。
- Vue Router、Pinia、Element Plus、Vite、TypeScriptの利用状況を確認した。
- Frontendが既存状態のままではbuildできないことを確認した。
- `cdk.out`、CDK staging、TypeScript中間生成物、Infra配下に誤生成されたJavaScript、npm cacheがGit差分へ出ないよう `.gitignore` を補強した。

Frontendには次の既存不備があったため、InfraのSPA assetを作れる最小限の範囲で修正した。

- `frontend/src/router/index.ts` にdefault exportがなかった。
- `frontend/src/stores/auth.ts` と `frontend/src/stores/loading.ts` が空だった。
- 画面が存在しない `/novels.svg` を参照しており、Vite buildが失敗していた。

認証storeはPhase 2までの仮実装であり、未実装状態を認証成功と誤認しないよう、loginは必ず失敗を返す。

### 2.2 CDKプロジェクト作成

以下を `infra/` に作成した。

```text
infra/
  bin/
    app.ts
  lib/
    distribution.ts
    manga-stack.ts
    storage.ts
  test/
    manga-stack.test.ts
  cdk.json
  package.json
  package-lock.json
  tsconfig.json
```

主な方針は次のとおり。

- AWS CDK v2を使用する。
- リージョン未指定時は `ap-northeast-1` を使用する。
- AWS accountはソースへ固定せず、CDK/AWS CLI環境から解決する。
- TypeScriptは `noEmit: true` とし、コンパイル済みJavaScriptを生成しない。
- CDKアプリは `tsx` でTypeScriptのまま実行する。
- `typecheck`、`test`、`synth`、`diff`、`deploy` scriptを用意した。
- `synth`、`diff`、`deploy` の前にFrontendをbuildする。

### 2.3 S3

次の2 Bucketを定義した。

#### SPA用Bucket

- Block Public Accessをすべて有効化
- `publicReadAccess: false`
- SSL通信を強制
- S3 managed encryption
- versioningなし
- SPA成果物だけを格納
- 再生成可能なデータのため `RemovalPolicy.DESTROY`
- Stack削除時に空にできるよう `autoDeleteObjects: true`

#### 漫画用Bucket

- Block Public Accessをすべて有効化
- `publicReadAccess: false`
- SSL通信を強制
- S3 managed encryption
- versioningなし
- `RemovalPolicy.RETAIN`
- `autoDeleteObjects: false`

漫画用Bucketは `cdk destroy` やStack置換に連動して削除されない設定とした。

### 2.4 CloudFront / OAC

- SPA Bucketと漫画Bucketの両方にOAC originを作成した。
- OAIは使用していない。
- CDKがDistribution限定のS3 Bucket Policyを生成する構成とした。
- CloudFront標準ドメインを初期サイトURLとした。
- `PriceClass.PRICE_CLASS_100` を指定した。
- HTTPアクセスはHTTPSへredirectする。
- HTTP/2とHTTP/3を有効にした。
- Security Headersのmanaged response headers policyを使用した。
- Distribution ID、標準サイトURL、各Bucket名をCloudFormation Outputへ出力する。

### 2.5 SPA routing

デフォルトBehaviorのviewer requestにCloudFront Functionを関連付けた。

- 拡張子を持たないSPA routeは `/index.html` へrewriteする。
- `/api/*` はrewriteしない。
- `/manga/*` はrewriteしない。
- Distribution全体の403/404を200へ変換するcustom error responseは使用しない。

これにより、将来のAPIエラーや漫画認証の403がSPAの200レスポンスに置き換わることを防ぐ。

### 2.6 Phase 1中の漫画保護

`planning.md` ではCloudFront Distribution作成がPhase 1、Trusted Key GroupとSigned CookieがPhase 2に分かれている。

しかし、Phase 1で保護なしの `/manga/*` Behaviorを作ると、Phase 2完了までの間だけ漫画がCloudFront経由で閲覧可能になる。この一時的な露出を避けるため、`PhaseOneMangaGuard` CloudFront Functionを追加し、Phase 1では `/manga/*` に必ず403を返す構成とした。

Phase 2では、このガードを単に削除するのではなく、CloudFront Public Key、Trusted Key Group、Signed Cookie保護へ置き換えてから削除する。

### 2.7 SPA配置

`BucketDeployment`で `frontend/dist` のみをSPA Bucketへ配置する定義を追加した。

- 漫画画像はCDK assetへ含めない。
- SPA更新時はCloudFrontの `/*` をinvalidation対象とする。
- `prune: true` とし、古いSPA assetを残さない。

## 3. `planning.md` との対応

| Planning項目                | 状態                       | 内容・未実施理由                                                                                                        |
| --------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 2.1 リポジトリ確認          | 一部完了                   | 依存関係、script、Router、Pinia、TypeScript、`.gitignore`を確認。npm workspace化は現時点で必要性がないため保留。        |
| 2.2 共通型                  | 未実施                     | Backend APIとUpload実装開始前に定義する。Phase 1のS3/CloudFrontだけでは確定させる必要がない。                           |
| 2.3 設定値                  | 一部完了                   | 標準regionを実装。Cookie期限、Presign期限、batch size、concurrency、WebP qualityは該当Phaseまで保留。                   |
| 3.1 CDKプロジェクト         | 完了                       | package、TypeScript、app、stack、script、typecheck、synth、禁止サービス確認を実施。                                     |
| 3.2 SPA用S3                 | 完了                       | 非公開、SSL、versioningなし、SPA専用、削除方針を実装。                                                                  |
| 3.3 漫画用S3                | 一部完了                   | 非公開、SSL、RETAIN、OACを実装。Presigned PUT CORSとLambda権限はUpload APIがないためPhase 4まで保留。                   |
| 3.4 CloudFront OAC          | 完了                       | 2つのS3 originをOACで構成。S3 website endpointとOAIは不使用。                                                           |
| 3.5 CloudFront Distribution | 一部完了                   | SPAと漫画Behaviorを実装。`/api/*` BehaviorはAPI Gateway未実装のため保留。metadata/index専用短期cacheもPhase 5まで保留。 |
| 3.6 SPA routing             | 実装完了・実環境確認未実施 | FunctionとBehavior関連付けをsynthで確認。CloudFront URLでの200/403確認は未デプロイのため未実施。                        |
| 3.7 Public Key / Key Group  | 未実施                     | PlanningどおりPhase 2で実装する。                                                                                       |
| 3.8 API Gateway HTTP API    | 未実施                     | Backend認証実装と合わせて次Phase以降に実施する。                                                                        |
| 3.9 SSM Parameter Store     | 未実施                     | 保存する認証情報とLambdaがまだないためPhase 2で実施する。                                                               |
| 3.10 独自ドメイン           | 未実施                     | 初期構築はCloudFront標準ドメインを使う方針。任意設定は後続Phaseで追加する。                                             |
| Phase 1 deploy確認          | 未実施                     | ユーザー指示によりデプロイ禁止。AWS認証、SSO、CDK bootstrapも実施していない。                                           |

## 4. Planningで明示されていなかった点・今回判明した点

### 4.1 TypeScriptとCDKアプリ実行器

インストールされたTypeScriptは7系で、`ts-node`を使ったCDK synthは次のエラーで失敗した。

```text
Cannot read properties of undefined (reading 'fileExists')
```

JavaScriptを生成せずに実行する方針は維持し、CDKアプリ実行器を `tsx` へ変更した。その後のtypecheck、test、synthは成功した。

### 4.2 Windows PowerShell上のnpm

PowerShellの実行ポリシーにより `npm.ps1` が拒否されたため、確認コマンドでは `C:\Program Files\nodejs\npm.cmd` を使用した。

また、npm registryへの接続で証明書検証エラーが発生したため、Node.jsへ `--use-system-ca` を指定した。npm cacheはワークスペース内のGit無視済み `.npm-cache` を使用した。

これらは [`../AGENTS.md`](../AGENTS.md) に再発防止メモとして記録した。

### 4.3 CloudFront標準証明書のTLS設定

独自ドメインを使わずCloudFront標準証明書を使う場合、Distributionの `minimumProtocolVersion` 指定は効果がなく、CDKから警告されることを確認した。

効果のない設定は削除し、独自ドメインとACM証明書を導入するPhaseで設定することとした。

### 4.4 CDK Custom Resource

`BucketDeployment` とSPA Bucketの `autoDeleteObjects: true` により、synth結果にはCDK管理のLambda、IAM Role、Lambda Layer、Custom Resourceが含まれる。

これらは常時稼働するアプリケーションBackendではなく、デプロイ時または削除時だけ動作するCDK Custom Resourceである。固定料金のサーバーを追加したものではない。

### 4.5 Synthと生成物

通常の `cdk synth` は `infra/cdk.out` を作成するため、今回の最終確認では一時ディレクトリを `--output` に指定し、確認後に削除した。

`.gitignore`にも次を追加済み。

- `cdk.out`
- `.cdk.staging`
- `*.tsbuildinfo`
- `infra/**/*.js`
- `infra/**/*.js.map`
- `infra/**/*.d.ts`
- npm cache

## 5. 実装結果

最終synthで生成されたCloudFormation resourceは19件だった。

```text
AWS::CDK::Metadata                  1
AWS::CloudFront::CachePolicy       1
AWS::CloudFront::Distribution      1
AWS::CloudFront::Function          2
AWS::CloudFront::OriginAccessControl 2
AWS::IAM::Policy                   1
AWS::IAM::Role                     2
AWS::Lambda::Function              2
AWS::Lambda::LayerVersion          1
AWS::S3::Bucket                    2
AWS::S3::BucketPolicy              2
Custom::CDKBucketDeployment        1
Custom::S3AutoDeleteObjects        1
```

仕様で禁止されている次のresourceは0件だった。

- EC2
- ECS / Fargate
- ALB
- RDS / Aurora
- DynamoDB
- Cognito
- ElastiCache
- OpenSearch
- Step Functions

漫画Bucketのsynth結果は次のとおり。

```text
DeletionPolicy: Retain
UpdateReplacePolicy: Retain
```

## 6. 確認結果

次の確認はすべて成功した。

- Infra TypeScript typecheck
- Infra Prettier check
- Infra unit test 3件
    - Private S3 BucketとOACの存在
    - 漫画BucketのRETAINとPhase 1の403ガード
    - 禁止AWSサービスが生成されないこと
- Frontend type-check
- Frontend ESLint
- Frontend production build
- CDK synth
- synth後のCloudFormation resource集計
- `infra/cdk.out` がワークスペースに残っていないこと
- `infra/` にコンパイル済みJavaScriptが生成されていないこと
- `frontend/dist` とCDK生成物がGit無視対象であること

## 7. 未確認事項

デプロイしていないため、次はまだ確認していない。

- CloudFront標準URLからSPAを表示できること
- SPA routeへ直接アクセスして200になること
- 未認証の `/manga/test.webp` が実環境で403になること
- SPA Bucketと漫画BucketのS3 URLが実環境で403になること
- `cdk destroy` 実行後も漫画Bucketが残ること
- CloudFrontからS3へのOACアクセスが実環境で成功すること

これらを確認する段階ではAWS認証またはSSO login、対象accountでのCDK bootstrap状況確認が必要になる。実行前にユーザーへ確認し、勝手にdeployしない。

## 8. 次の作業候補

Planningに沿う場合、次はPhase 2として以下を進める。

1. Backendの最小TypeScript構成と共通レスポンス・validation基盤
2. SSM Parameter Storeのparameter名とIAM権限定義
3. CloudFront Public Key / Key Group
4. Login / Logout Lambda
5. API Gateway HTTP APIと `/api/login`、`/api/logout`
6. CloudFront Signed Cookie
7. `PhaseOneMangaGuard` からTrusted Key Group保護への置き換え

AWS resourceを作成するdeploy作業は、別途明示的な許可を得てから実施する。
