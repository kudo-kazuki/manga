# プライベート漫画閲覧サイト AWS/CDK 実装仕様書

## 0. この文書について

以下の仕様に従って、AWS上にプライベートな漫画閲覧サイトを実装してください。

要件を勝手に一般的なWebサービス向けへ拡張しないでください。

このサービスは不特定多数向けではなく、利用者は最大でも4～5人程度です。

そのため、可用性・大規模アクセス・ユーザー管理などのために不要なAWSサービスを追加しないでください。

特に、以下は明示的な必要性がない限り導入禁止です。

- EC2
- ECS
- Fargate
- ALB
- RDS
- Aurora
- DynamoDB
- Cognito
- NAT Gateway
- ElastiCache
- OpenSearch
- Step Functions

また、JWTを認証の中心には使用しません。

最重要方針は以下です。

1. 非公開サイトであること
2. 数人だけが共通パスワードで閲覧できること
3. 漫画画像をS3へ大量保存できること
4. 作品フォルダを一度D&Dするだけで数千～1万枚以上を登録できること
5. アップロード前にブラウザでWebPへ変換すること
6. 漫画画像をS3から直接公開しないこと
7. CloudFront経由でのみ閲覧させること
8. AWS料金を可能な限り低くすること
9. インフラはAWS CDK TypeScriptで管理すること
10. DBを使用しないこと

# 1. 技術スタック

## Frontend

- Vue 3
- TypeScript
- Vite
- `<script setup>`
- Vue Router
- Pinia
- 必要であればElement Plusを使用してよい

FrontendはSPAとする。

## Infrastructure

- AWS CDK v2
- TypeScript

## Backend

- AWS Lambda
- Node.jsの現在AWS Lambda/CDKで安定して利用可能なLTSランタイム
- TypeScript

APIはAmazon API Gateway HTTP APIを使用する。

REST APIではなくHTTP APIを優先する。

理由は、今回必要なのが単純な認証・アップロード補助APIだけであり、高機能なREST APIは不要だからである。

# 2. 全体アーキテクチャ

基本構成は以下とする。

```text
                    User Browser
                         |
                         v
                    CloudFront
                         |
              +----------+----------+
              |                     |
              v                     v
         Vue SPA                 /manga/*
              |                     |
              |                Signed Cookie
              |                     |
              |                     v
              |                 Private S3
              |
              |
              +---- /api/* ---- API Gateway HTTP API
                                      |
                                      v
                                    Lambda
                                      |
                         +------------+-------------+
                         |                          |
                         v                          v
                Signed Cookie生成           Presigned PUT URL生成
                                                   |
                                                   v
                                             Private S3
```

S3はPublic Accessを完全に禁止する。

漫画画像はS3 URLを直接使用して閲覧できてはいけない。

CloudFront → S3間はOrigin Access Control（OAC）を使用する。

OAIではなくOACを使用すること。

# 3. ドメイン

独自ドメインまたはサブドメインを使用できる設計とする。

例：

```text
manga.example.com
```

Route 53を必須とはしない。

現在ドメインは外部DNSで管理している可能性があるため、

- ACM証明書
- CloudFront Distribution

をCDKで作成し、

必要なDNSレコードをREADMEに出力・説明する形でもよい。

CloudFront用ACM証明書はus-east-1が必要であることを考慮すること。

# 4. S3構成

漫画データ保存用S3 Bucketを作成する。

Bucketは以下を満たすこと。

- Block Public Access = ALL
- publicReadAccess = false
- HTTPSのみ許可
- CloudFront OAC経由のGETのみ許可
- 管理用Lambdaには必要最小限の権限だけ付与
- 不要なVersioningは有効化しない
- 不要なアクセスログ等で料金を増やさない

S3 URLによる漫画画像の直接閲覧は禁止する。

# 5. S3オブジェクト構造

基本構造は以下とする。

```text
manga/
  baburios/
    metadata.json

    001/
      001.webp
      002.webp
      003.webp
      ...
      200.webp

    002/
      001.webp
      002.webp
      ...
      200.webp

    ...

    050/
      001.webp
      ...
      200.webp
```

ただし「巻」という概念をコード上で固定しないこと。

一般化して、

```text
作品
  └ chapter
      └ page
```

として扱う。

例えば入力が、

```text
バブリオス/
  1巻/
  2巻/
  3巻/
```

でも、

```text
作品A/
  第一章/
  第二章/
```

でも処理できる構造にする。

内部S3 Keyでは安全なslugまたはIDへ正規化してよい。

表示名はmetadata.jsonに保持する。

# 6. metadata.json

DBは使用しない。

作品・チャプター・ページ情報はJSONで管理する。

例：

```json
{
  "id": "baburios",
  "title": "バブリオス",
  "chapters": [
    {
      "id": "001",
      "title": "1巻",
      "pages": 200
    },
    {
      "id": "002",
      "title": "2巻",
      "pages": 200
    }
  ]
}
```

必要なら以下を追加してよい。

```text
createdAt
updatedAt
cover
description
```

ただし不要なメタデータを大量に追加しないこと。

作品一覧についてもDBを使用せず、例えば

```text
manga/index.json
```

などで管理してよい。

# 7. 閲覧認証

このサイトは一般公開しない。

利用者は4～5人程度。

閲覧者ごとのアカウントは作らない。

共通パスワード方式とする。

ログイン画面：

```text
Password
[****************]

[ログイン]
```

ログイン成功後、CloudFront Signed Cookieを発行する。

CloudFront Signed URLを画像1枚ずつ発行する方式は禁止する。

理由：

1作品で10,000枚以上存在する可能性があるため。

CloudFront Signed Cookieを使用し、

```text
/manga/*
```

以下へのアクセスを一定時間許可する。

# 8. CloudFront Signed Cookie

CloudFront Trusted Key Groupを使用する。

Legacy Trusted Signerは使用しない。

CDKで可能な範囲はCDK管理する。

公開鍵をCloudFront Public Key / Key Groupへ登録する。

秘密鍵は絶対にFrontendへ置かない。

秘密鍵はLambdaだけが使用できる安全な場所に保存する。

秘密鍵や共通パスワードをGit repositoryへcommitしてはいけない。

CloudFront Signed Cookieは以下を使用する。

```text
CloudFront-Policy
CloudFront-Signature
CloudFront-Key-Pair-Id
```

Cookieは可能な限り以下とする。

```text
Secure
HttpOnly
SameSite=Lax
```

必要に応じてPath/Domainを適切に設定する。

Signed Cookieの有効期限は設定値として変更可能にする。

初期値は30日とする。Browserを閉じても保持される永続Cookieとし、Logoutでは明示的に削除する。

Custom Policyを使用し、

原則として、

```text
https://manga.example.com/manga/*
```

だけを閲覧可能にする。

サイト全体をSigned Cookie必須にしないこと。

ログインページやSPAそのものは認証前でも取得可能でよい。

ただし漫画画像およびprivate metadataは認証必須とする。

# 9. CloudFront Behavior

最低限以下を分離する。

```text
/*
    Vue SPA
    Signed Cookie不要

/manga/*
    Private S3
    Trusted Key Group必須
    Signed Cookie必須
```

SPA routingを考慮する。

Vue Router history modeを使用する場合、

```text
/work/xxx
/login
/viewer/xxx
```

などを直接開いてもindex.htmlへフォールバックできるようにする。

ただし、

```text
/manga/*
/api/*
```

までindex.htmlへフォールバックさせないこと。

# 10. ログインAPI

例：

```text
POST /api/login
```

request:

```json
{
  "password": "..."
}
```

Lambdaで共通パスワードを検証する。

成功時：

- CloudFront Signed CookieをSet-Cookieで返す
- 200

失敗時：

- 401

パスワード比較では不用意な情報漏洩を避けること。

パスワードそのものをログへ出さないこと。

パスワードはソースコード、cdk.context.json、git管理対象.env等にハードコードしないこと。

# 11. ログアウト

以下を実装する。

```text
POST /api/logout
```

CloudFront Signed Cookieを期限切れにして削除する。

Frontend側にもLogoutボタンを用意する。

# 12. 管理画面

Frontend SPA内に管理用画面を作る。

例：

```text
/admin
```

目的は漫画作品の一括アップロード。

Upload画面と削除画面は分離する。削除画面では公開中の作品一覧を表示し、作品単位で削除できるようにする。削除前には作品名と不可逆である旨を確認modalへ表示し、処理中は操作を無効化して二重送信を防ぐ。

最重要UX：

ユーザーは作品フォルダを1回だけDrag & Dropする。

例えば、

```text
バブリオス/
  1巻/
    1.jpg
    2.jpg
    ...
    200.jpg

  2巻/
    1.jpg
    2.jpg
    ...
    200.jpg

  ...

  50巻/
    1.jpg
    ...
    200.jpg
```

これを、

```text
バブリオス
```

フォルダごと一回D&Dする。

50個の巻フォルダを個別選択させてはいけない。

10,000枚を個別選択させてはいけない。

# 13. Directory Drag & Drop

ブラウザでフォルダ階層を再帰的に読み取る。

Chrome/Edgeを主要対象ブラウザとしてよい。

必要に応じて、

- File System Access API
- DataTransferItem
- webkitGetAsEntry
- webkitdirectory

等を適切に使用する。

重要なのは、

```text
作品フォルダ
  ↓
chapter folders
  ↓
image files
```

という階層を保持したまま読み取れることである。

# 14. ファイル並び順

文字列ソートだけを使用してはいけない。

例えば、

```text
1.jpg
2.jpg
3.jpg
...
10.jpg
11.jpg
```

を、

```text
1
10
11
2
3
```

の順にしてはいけない。

Natural Sortを使用する。

同様に、

```text
1巻
2巻
...
10巻
```

も自然順にする。

アップロード前に解析結果を画面へ表示する。

例：

```text
作品：バブリオス

50 chapters
10,000 images
Original size: 9.8 GB

1巻     200 pages
2巻     200 pages
...
50巻    200 pages

[Upload]
```

# 15. WebP変換

アップロード前にブラウザ側で画像をWebPへ変換する。

重要：

元JPEG/PNGを一度S3へアップロードしてからLambda等で変換する設計は禁止する。

以下の流れとする。

```text
JPEG/PNG
   |
Browser
   |
WebP encode
   |
WebP Blob
   |
Presigned PUT
   |
S3
```

AWS側には原則WebPのみ保存する。

初期品質値は設定可能にする。

例：

```text
quality = 0.85
```

ただし漫画画像なので文字・線画・トーンの品質を極端に劣化させないこと。

管理画面でqualityを変更可能にしてもよい。

# 16. 巨大アップロード時のメモリ管理

1作品10,000枚以上を想定する。

絶対に10,000枚全部を画像として同時デコードしないこと。

絶対に10,000枚分のWebP Blobを同時にメモリへ保持しないこと。

ユーザー操作としては一括D&Dだが、内部処理はqueue方式とする。

概念：

```text
10,000 files
    |
Upload Queue
    |
5～10程度を並列処理
    |
decode
    |
WebP encode
    |
upload
    |
release memory
    |
next
```

並列数は定数または設定値として管理する。

PCをフリーズさせないことを優先する。

可能であればWeb Worker等を検討してよいが、不要に複雑化しないこと。

# 17. Presigned URL

漫画画像のアップロードはLambda経由でバイナリ転送しない。

禁止：

```text
Browser
   |
10GB images
   |
Lambda
   |
S3
```

必須：

```text
Browser
   |
"このファイルをuploadしたい"
   |
Lambda
   |
Presigned PUT URL
   |
Browser ----------------> S3
```

LambdaはPresigned URLを発行するだけ。

画像データ本体は、

```text
Browser -> S3
```

へ直接PUTする。

# 18. Presigned URLのバッチ発行

10,000個のPresigned URLを1レスポンスで返さない。

例えば100件程度ずつバッチ発行する。

例：

```text
001～100
   ↓
Presigned URLs取得
   ↓
WebP変換・Upload

101～200
   ↓
Presigned URLs取得
   ↓
Upload

...
```

バッチサイズは定数として管理する。

# 19. Upload API

例えば以下を用意する。

```text
POST /api/upload/presign
```

request例：

```json
{
  "workId": "baburios",
  "chapterId": "001",
  "files": [
    {
      "name": "001.webp",
      "contentType": "image/webp"
    }
  ]
}
```

response例：

```json
{
  "files": [
    {
      "key": "manga/baburios/001/001.webp",
      "uploadUrl": "..."
    }
  ]
}
```

Presigned URLには短い有効期限を設定する。

例えば15分程度。

Lambdaには対象Bucketへの必要最小限のPutObject権限を与える。

# 20. Upload APIの認証

重要。

Presigned URL発行APIを一般公開してはいけない。

認証済みユーザーだけが呼び出せるようにする。

ただし今回ユーザー管理DBやCognitoは導入しない。

少人数向けという要件を維持したまま、簡潔な認証方式を実装する。

少なくとも、

```text
未認証の第三者
   ↓
/api/upload/presign
   ↓
Presigned URL取得
```

が成立してはいけない。

管理者用パスワードを閲覧用パスワードとは別に設定可能にすることを推奨する。

管理APIについては必要であれば、署名されたHttpOnly管理セッションCookieなど、DB不要の軽量方式を採用してよい。

管理sessionの初期有効期限は30日とし、Browser終了後も同じ端末で利用できるようにする。

管理用秘密情報をFrontendへ埋め込んではいけない。

# 21. Upload Progress

管理画面には進捗を表示する。

例：

```text
バブリオス

██████████████░░░░░░ 67%

6,742 / 10,000

現在：
34巻 / 143ページ

変換済み: 6,751
Upload済み: 6,742
失敗: 0

Original:
9.82 GB

Converted:
2.91 GB

Compression:
70.4%

[Pause]
```

最低限、

- 全ファイル数
- 完了数
- 失敗数
- 現在処理中ファイル
- 全体progress

を表示する。

# 22. Retry

一部ファイルのupload失敗によって全作品uploadを最初からやり直す必要があってはいけない。

失敗ファイルを記録する。

最後に、

```text
9997 succeeded
3 failed

[Retry failed files]
```

とできるようにする。

再試行時は失敗した画像だけWebP変換・PUTする。

# 23. metadata生成タイミング

全画像のupload成功後、

```text
metadata.json
```

を生成・更新する。

不完全upload状態の作品を正常公開済み作品として扱わない。

推奨フロー：

```text
START
  |
画像Upload
  |
全成功？
  |
 YES
  |
metadata確定
  |
index.json更新
  |
COMPLETED
```

途中失敗した場合は、

```text
INCOMPLETE
```

として扱える設計にする。

DBは使用しないので、必要なら一時的なmanifest JSONをS3へ保存してよい。

# 24. ファイル名正規化

元画像が、

```text
1.jpg
2.jpg
...
200.jpg
```

ならS3では、

```text
001.webp
002.webp
...
200.webp
```

のようにzero paddingしてよい。

chapterも、

```text
1巻 -> 001
2巻 -> 002
...
50巻 -> 050
```

としてよい。

ただし表示名、

```text
1巻
2巻
```

はmetadata.jsonへ保持する。

# 25. 漫画Viewer

最低限以下を実装する。

- 作品一覧
- 作品詳細
- chapter一覧
- 漫画Viewer
- 前chapter
- 次chapter

Viewerではmetadata.jsonからページ数を取得し、

```text
/manga/baburios/003/001.webp
/manga/baburios/003/002.webp
...
```

を組み立てる。

1万ページ分のURL一覧をAPIから取得する必要はない。

Signed Cookieがあるため通常のCloudFront URLを使用する。

# 26. Lazy Load

chapter内の200画像を一気にdecodeしない。

ブラウザの負荷を抑える。

`loading="lazy"`やIntersectionObserver等を使用し、現在位置周辺を優先して読み込む。

ただし漫画をスクロールして読んだ際に画像表示が頻繁に間に合わなくなるような極端なlazy loadにはしない。

# 27. キャッシュ

漫画画像は基本的にアップロード後変更しないものとして扱う。

CloudFront/S3のキャッシュを有効活用する。

画像ファイルには長めのCache-Controlを設定してよい。

metadata.jsonやindex.jsonは画像より短いキャッシュ時間とする。

作品更新後に古いmetadataが長時間残らない設計にする。

不要なCloudFront Invalidationを大量発行しない。

# 28. セキュリティ

最低限以下を守る。

- S3 Public Access完全禁止
- S3直接URLから画像取得不可
- HTTPSのみ
- CloudFront OAC
- CloudFront Trusted Key Group
- Signed Cookie
- SecretをGitへcommitしない
- SecretをFrontendへ埋め込まない
- Presigned URL短時間有効
- Presigned URL発行APIは認証必須
- Lambda IAM Roleはleast privilege
- Bucket名等を秘密情報として扱う必要はない
- パスワードをログ出力しない
- Private Keyをログ出力しない
- Presigned URLを不用意にログ出力しない

# 29. WAF

AWS WAFを必須要件にはしない。

利用者4～5人の小規模private siteなので、料金増加につながる構成を勝手に追加しない。

CloudFrontプラン等で追加料金なしに利用可能な保護がある場合は利用を検討してよい。

# 30. コスト最優先事項

このサービスは極めて小規模。

月額AWS料金は可能な限り数十円以下を目標とする。

絶対に以下を勝手に追加しない。

```text
NAT Gateway
ALB
EC2
RDS
Aurora
ECS
Fargate
ElastiCache
OpenSearch
```

「ベストプラクティスだから」という理由だけで固定料金の発生するサービスを追加しない。

必要性がある場合は実装前に理由と月額コストを説明すること。

# 31. CDK

AWSリソースは原則AWS CDK v2 TypeScriptで定義する。

例えば以下のように整理してよい。

```text
infra/
  bin/
    app.ts

  lib/
    manga-stack.ts

    constructs/
      storage.ts
      cloudfront.ts
      auth.ts
      api.ts

frontend/
  src/
    pages/
    components/
    stores/
    composables/

backend/
  auth/
  upload/
```

無理にConstructを細分化しすぎない。

読みやすさを優先する。

# 32. CDKで作成する主なリソース

最低限：

- S3 Bucket
- CloudFront Distribution
- CloudFront OAC
- CloudFront Public Key
- CloudFront Key Group
- Lambda
- API Gateway HTTP API
- IAM Role / Policies
- 必要に応じてACM Certificate

Frontendのdeployについては、

```text
npm run build
cdk deploy
```

または別deploy script等でS3へ配置できるようにする。

`BucketDeployment`を使用してもよいが、大量漫画画像をCDK assetとして管理してはいけない。

漫画画像は管理画面からuploadする。

CDK deployment packageへ漫画画像を含めない。

# 33. CloudFront Private Key

CloudFront Signed Cookie生成用private keyについては、CDK sourceへ直接記述しない。

公開鍵はCloudFront Key Groupへ登録する。

秘密鍵はLambdaのみ取得可能にする。

Secrets Manager等を使用する場合、今回の低コスト要件を考慮し、月額料金が発生するサービスを無条件に選ばないこと。

より低コストで安全な選択肢がある場合は比較して採用する。

秘密鍵管理方式を実装する前に、方式・安全性・料金をREADMEへ明記する。

# 34. CORS

可能なら、

```text
https://manga.example.com
```

という同一オリジン配下にFrontend/APIをまとめ、不要なCORS問題を発生させない構成を優先する。

S3 Presigned PUTについては必要なBucket CORSだけ設定する。

許可Originを`*`にしない。

必要なHTTP methodのみ許可する。

# 35. 削除保護

漫画画像の誤削除は非常に困る。

CDK Stack削除時に漫画Bucketまで簡単に消えないようにする。

例えば、

```text
RemovalPolicy.RETAIN
autoDeleteObjects: false
```

等を検討する。

`cdk destroy`で10,000枚の漫画が消える設計は禁止する。

# 36. エラー処理

Frontendでは最低限以下を区別する。

```text
401
認証切れ

403
閲覧権限なし

Upload URL取得失敗

S3 PUT失敗

WebP変換失敗

metadata取得失敗

network error
```

Signed Cookie期限切れの場合はログイン画面へ誘導する。

# 37. Upload Resume

第一実装ではブラウザを完全に閉じた後のresumeまでは必須としない。

ただし同一セッション中、

- Pause
- Resume
- Retry failed files

は可能にする。

将来的にresume manifestをS3へ保存できる構造にしておくと望ましい。

# 38. テスト

最低限以下をテストする。

Backend：

- 正しいパスワード
- 間違ったパスワード
- Signed Cookie生成
- 未認証Presign拒否
- 不正なS3 Key拒否
- path traversal相当の入力拒否
- Presigned URL生成

Frontend：

- Natural Sort
- chapter解析
- page解析
- ファイル名正規化
- metadata生成
- upload queue
- retry

特に、

```text
1.jpg
2.jpg
10.jpg
```

が、

```text
1
2
10
```

になることをテストする。

# 39. README

READMEには最低限以下を書く。

- architecture
- local development
- required environment variables
- AWS prerequisites
- CDK bootstrap
- deploy方法
- domain設定
- CloudFront key pair作成方法
- secret設定方法
- frontend deploy
- manga upload方法
- destroy時の注意
- 想定AWS料金
- 料金が発生する可能性のあるresource一覧

# 40. 実装時の重要ルール

この仕様で不明点があった場合、勝手に大規模SaaS向けの構成へ変更しない。

今回の前提は最後まで、

```text
Private manga site
Users: 4～5
Images: 10,000～100,000程度まで想定
Average image size after conversion: 約200～500KB
DB: none
Server: none
Cost: extremely low
```

である。

「将来100万人が使う可能性」などは考慮しなくてよい。

YAGNIを優先する。

# 41. 実装順序

いきなり全機能を一括実装しない。

以下の順序で進める。

Phase 1:

```text
CDK
S3
CloudFront
OAC
Vue SPA
```

まずSPAがCloudFrontから表示できることを確認する。

Phase 2:

```text
Trusted Key Group
Login Lambda
Signed Cookie
Private /manga/*
```

ログイン前：

```text
/manga/test.webp
=> 403
```

ログイン後：

```text
/manga/test.webp
=> 200
```

になることを確認する。

S3直接URL：

```text
=> 403
```

も確認する。

Phase 3:

```text
Admin
Directory D&D
Folder解析
Natural Sort
WebP conversion
```

まずローカルで正しく10,000枚規模をqueue処理できるようにする。

Phase 4:

```text
Presigned PUT
S3 direct upload
progress
retry
```

Phase 5:

```text
metadata.json
index.json
作品一覧
chapter一覧
Viewer
```

Phase 6:

```text
error handling
security review
cost review
tests
README
```

各Phase終了時に動作確認してから次へ進む。

# 42. 完成条件

以下をすべて満たしたら完成とする。

1. `manga.example.com`へアクセスできる
2. 未ログインでは漫画画像を取得できない
3. S3直接URLでは漫画画像を取得できない
4. 正しい共通パスワードでログインできる
5. Signed Cookieによって漫画画像を閲覧できる
6. Cookie期限切れ後は再度閲覧不可になる
7. 管理画面へ作品フォルダを一回D&Dできる
8. 50 chapter × 200 images = 10,000 imagesでもフォルダ構造を認識できる
9. Natural Sortが正しい
10. JPEG/PNGをBrowserでWebP変換できる
11. 10,000画像を同時にRAMへ展開しない
12. queueで順次処理できる
13. Presigned URL経由でBrowserからS3へ直接uploadできる
14. Lambdaへ画像binaryを送らない
15. progressが確認できる
16. upload失敗画像だけretryできる
17. upload完了後metadataが生成される
18. Viewerからchapterを読める
19. 前chapter/次chapterへ移動できる
20. `cdk destroy`で漫画画像Bucketを誤削除しない
21. 不要な固定料金AWS resourceが存在しない
22. secretがGit/Frontendへ含まれていない

# 43. 最初にCodexが行うこと

まずコードを書き始める前に、

1. この仕様を読んで理解したアーキテクチャを簡潔に説明する
2. 作成予定のディレクトリ構造を提示する
3. CDKで作成するAWSリソース一覧を提示する
4. 月額固定料金が発生する可能性があるリソースを列挙する
5. 認証・CloudFront Signed Cookie・管理画面認証の実装方法を説明する
6. 不明点または仕様上の矛盾があれば指摘する

その後、Phase 1から実装を開始する。

仕様を勝手に変更しないこと。

AWS/CDK APIについて現在の仕様が不明な場合は、推測で古いAPIを書くのではなく、現在インストールされているAWS CDK v2の型定義・公式ドキュメントを確認してから実装すること。
