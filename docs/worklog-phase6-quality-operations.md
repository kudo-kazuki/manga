# Phase 6: 品質・セキュリティ・運用準備 実装記録

作業日: 2026-09-21

## 1. Viewerの画像エラー分類

`img` 要素の読み込み失敗だけではHTTP statusを取得できないため、最初に失敗した画像だけへHEAD requestを送り、次の3種類へ分類するようにした。正常な画像へ追加requestは発生しない。

- 401/403: 閲覧session切れとして再ログインを案内
- 404: 画像欠損として管理者への確認を案内
- その他のstatusまたは通信失敗: network errorとして再読み込みを案内

S3は `ListBucket` 権限がないprincipalに、存在しないobjectも403で返す。画像欠損を404として判別できるよう、CloudFront service principalに限り、対象Distribution ARNを条件として漫画Bucketの `manga/*` prefixの存在判定を許可した。Browserや匿名principalへBucket一覧権限を公開するものではない。

## 2. セキュリティ確認

自動testとsynth templateで次を確認した。

- S3 Public Access BlockとHTTPS強制を維持
- 漫画Bucketは `RemovalPolicy.RETAIN`、`autoDeleteObjects: false`
- 未認証ではPresign APIを利用不可
- CloudFront閲覧Cookieだけでは管理APIを利用不可
- path traversal、不正な拡張子、任意S3 Keyを拒否
- Lambda IAMを対象Parameter、Bucket、prefix、actionへ限定
- Upload CORSでwildcard originを不使用
- Frontend source mapを生成しない
- Git管理対象、Git履歴、Frontend bundleにAWS access key、private key、SSM Parameterの値を含めない
- password、private key、Cookie、Presigned URLをapplication logへ出力しない
- Secrets Manager、WAF、Route 53、ACMなど未使用のresourceを作らない

S3 direct URL、CloudFrontの403/200、Cookie期限切れ、実際のBrowser direct PUTはdeploy後の実AWS E2Eで確認する。

## 3. Secret準備

`scripts/prepare-secrets.ps1` を追加した。閲覧用と管理用passwordを非表示で受け取り、Backendが検証できるscrypt形式へ変換する。同時に管理Cookie用HMAC署名鍵とCloudFront用2048-bit RSA key pairを生成する。

生成物はGit無視済みの `secrets/` へ保存する。passwordの平文をfileやcommand line引数へ残さない。秘密鍵を失うと既存構成でSigned Cookieを再発行できないため、暗号化した別媒体へのbackupが必要である。

Windows PowerShell 5.1のUTF-8出力でBOMがhash先頭へ混入しないよう、text形式のsecretはUTF-8 BOMなしで明示保存する。

Phase 6でSSM Parameterは追加していない。deploy前に既存の次の4件をAWS ConsoleまたはREADME記載のAWS CLI手順でSecureStringとして登録する。

```text
/manga/viewer-password-hash
/manga/admin-password-hash
/manga/admin-signing-key
/manga/cloudfront-private-key
```

## 4. READMEと運用準備

root `README.md` に次をまとめた。

- architectureと採用AWS resource
- Node.js、AWS CLI、OpenSSLなどの前提
- install、local test、Frontend build
- Secret生成とSSM SecureString登録
- CDK bootstrapと2段階deploy
- 管理画面からのfolder upload
- deploy後のE2E checklist
- 独自ドメインを追加する場合のACMとDNSの考え方
- destroy、RETAIN、backupの注意
- security設計
- 課金対象、不要な固定費resourceがないこと、利用量別の概算
- troubleshooting

## 5. 確認結果

- Backend typecheck成功
- Backend unit test 33件成功
- Frontend type-check成功
- Frontend unit test 32件成功
- Frontend ESLint成功
- Frontend production build成功
- Infra typecheck成功
- Infra unit test 5件成功
- Backend、Frontend、Infraの `npm audit` はすべて脆弱性0件
- Frontend build成果物にsource mapなし
- Git管理対象とGit履歴の秘密情報scanで該当なし
- Secret生成用Node.js scriptの動作確認成功
- PowerShell scriptの構文確認成功
- CDK synth成功
- synth templateで禁止resourceなし、logging/versioningなし、LogGroup保持7日を確認
- shellの既定regionに左右されず、deploy先とSSM参照先が `ap-northeast-1` になることを確認

AWS resourceを変更するcommandは実行していない。残作業は、利用者がSSM Parameterを登録した後のCDK deployと、READMEのdeploy後checklistに沿った実AWS E2E確認だけである。
