# リポジトリ全体コードレビュー

作業日: 2026-09-22
レビュー基準HEAD: `ad48805b3c3628e891ac2dd5955eaeaf2cd4c781`

## 対象と方法

これは特定commitの差分レビューではなく、HEAD時点でGit管理されているリポジトリ全体のゼロベースレビューである。`frontend`、`backend`、`infra`、root script、設定、README、仕様書、planning、Phase 1〜6のworklogを対象にした。`node_modules`、`frontend/dist`、`secrets/`、CDK出力などの依存物・生成物は対象外とした。

次を横断して確認した。

- `docs/specification.md` と `docs/planning.md` の要件、各worklog、READMEの運用手順と実装の照合
- CloudFront / S3 / OAC / Key Group / IAM / SSM / Lambda / API Gatewayの認証境界と最小権限
- D&D、画像変換、Presign、Upload完了、metadata/index競合、Viewerのデータ経路
- Windows PowerShell 5.1、secret生成、deploy/2段階CORS、テストとコスト上のresource
- Git管理対象と履歴について、AWS access key形式およびPEM private key markerの検索

AWSへの接続、bootstrap、deploy、既存実装の変更、commitは実施していない。

## 結論

Critical / Highの指摘はない。S3の非公開化、CloudFront OACとTrusted Key Group、閲覧・管理認証の分離、SSM parameterのIAM最小権限、任意S3 Keyを受け取らないPresign設計、metadata/indexの条件付き更新は、仕様に対して概ね整合している。

ただし、1,000ページ以上のchapterをUploadして公開確定できない実装上の不整合が1件ある。仕様は数千〜1万枚以上の登録を明示しているため、deploy前に修正すべきMediumの問題である。

## 対応結果

対応日: 2026-09-22

各指摘をコードと仕様へ再照合し、次のように対応した。

- Mediumのpage filename不整合は妥当。Backendを総page数依存の可変paddingへ変える案は採用せず、命名規則を「1〜999は3桁、1000以降は自然に4桁以上」へ統一した。総page数が変わっても同じpage番号のkeyが変わらず、既存ViewerのURL生成とも一致するためである。Frontend parserとBackend expected keyへ1,000／10,000件の境界testを追加した。
- 不在のFrontend npm script指摘は妥当。AWS/CDK構成では使わない旧FTP deploy・content validation scriptと、未使用の `basic-ftp` dependencyを削除した。
- API throttle指摘は残存リスクとして妥当だが、WAFの常設は低コスト要件に反するため採用しない。Secret生成時の最低password長を16文字へ上げ、READMEで20文字以上のランダム値、401/429監視、必要時だけWAFを検討する方針を明記した。
- Secret上書き指摘は妥当。既存fileがある場合はdefaultで停止し、明示的な `-Force` だけで全件を再生成する。一時directoryですべて生成してから配置し、途中失敗で新旧secretが混在しにくい構成へ変更した。
- planning不整合は妥当。BackendとFrontendの実装済み項目を更新し、実AWS E2Eや未実装の改善項目は未完了のまま残した。

修正後のtest・synth結果は [Phase 6作業記録](worklog-phase6-quality-operations.md) に記載する。

## 指摘

### Medium — 1,000ページ以上のchapterでFrontendとComplete APIの画像名が一致せず、公開確定できない

- 根拠: [frontend/src/upload/folderParser.ts](../frontend/src/upload/folderParser.ts) 40–43行、106–126行、[backend/shared/metadata.ts](../backend/shared/metadata.ts) 127–136行
- 影響: Frontendはchapterのpage数が1,000以上のとき、`padId`により`0001.webp`〜`0999.webp`の4桁filenameをuploadする。一方Complete APIは最初の999件を常に`001.webp`〜`999.webp`として再構築する。そのためS3上のobjectが揃っていても存在確認に失敗し、`POST /api/upload/complete`が409を返す。これは1作品合計10,000枚という要件の範囲内で発生する。
- 推奨修正: page filenameの桁数規則を共通moduleへ移し、FrontendとBackendで同じ関数を利用する。少なくともBackendの期待Key生成で、chapterごとに`Math.max(3, String(chapter.pages).length)`を使用する。`200`、`1,000`、`10,000`ページのchapterについて、Presign keyとComplete APIのexpected keyが一致するtestを追加する。

### Low — Frontend packageの3つのscriptがGit上に存在しないfileを参照している

- 根拠: [frontend/package.json](../frontend/package.json) 13–14行、19行。`frontend/scripts/deploy-ftp.mjs` と `frontend/scripts/validate-content.mjs` はGit管理対象に存在しない。
- 影響: `npm run deploy`、`npm run deploy:dry-run`、`npm run validate:content` は`MODULE_NOT_FOUND`で失敗する。READMEは正しく`infra`側のCDK deployを案内しているが、package scriptを使う利用者や将来の自動化では誤ったFTP deploy経路を選ぶ余地が残る。
- 推奨修正: このサイトで不要なら3 scriptを削除する。必要なら実体を復元し、AWS/CDKの正規deploy経路と競合しない名称・説明へ直す。package scriptの存在確認をCIまたは最小のsmoke testに含める。

### Low — APIのthrottleは全体上限であり、送信元単位のログイン試行抑制・DoS分離にはならない

- 根拠: [infra/lib/api.ts](../infra/lib/api.ts) 279–286行
- 影響: `5 req/s`・burst `10`はHTTP API Stage全体の上限である。攻撃者がログインAPIを継続送信すると、正規利用者のログインだけでなく管理upload APIも同じ枠を消費する。弱い共有passwordを設定した場合、総当たり試行も十分には抑制されない。
- 推奨修正: 少人数・低コストを維持するなら、長くランダムな閲覧用・管理用passwordを運用手順で強く要求し、429/401急増を監視し、実利用に合わせてStage上限をさらに下げる。より強い防御が必要になった時点でのみ、WAF rate-based ruleまたは永続的な送信元別制御を検討する。WAFの無条件追加は本仕様のコスト方針と矛盾するため推奨しない。

### Low — secret再生成scriptが既存secretを確認なしで上書きする

- 根拠: [scripts/prepare-secrets.ps1](../scripts/prepare-secrets.ps1) 10行、67–91行
- 影響: 誤再実行でpassword導出値、管理署名鍵、CloudFront key pairが上書きされる。一部のSSM値だけを登録するとログイン不能になり、管理署名鍵の更新により既存管理sessionも失効する。秘密鍵をbackupせず再生成すると、意図した復旧手順を取りにくい。
- 推奨修正: 出力先の5 fileのいずれかが存在する場合は停止し、明示的な`-Force`時だけ全件を上書きする。再生成前にCookie全失効と公開鍵・秘密鍵・4 SSM parameterを一組として更新する必要を表示する。

### Low — planningの細目チェックリストが実装・worklog・Phase完了欄と同期していない

- 根拠: [docs/planning.md](planning.md) 193–486行のPhase 4〜5までの実装済み項目が未チェックのままである一方、584–590行ではdeploy前のPhase 6完了としている。実装結果は各[worklog](worklog-phase1-infrastructure.md)〜[worklog](worklog-phase6-quality-operations.md)に記載されている。
- 影響: 次の作業者がplanningを正本として読んだとき、実装済みの機能を未実装と誤認し、重複実装・誤った優先順位付けをするおそれがある。
- 推奨修正: planningの各項目を「local/synthで確認済み」「deploy後E2E待ち」に分けて更新する。未完了の実AWS確認だけを未チェックに残し、worklogへの参照をまとめる。

## 仕様に整合していることを確認した領域

- 漫画・Frontendの両S3 BucketはPublic Access Block、SSE-S3、TLS強制、OAC経由である。漫画Bucketだけは`RETAIN`かつ`autoDeleteObjects: false`で、destroyに連動しない。[infra/lib/storage.ts](../infra/lib/storage.ts) 13–54行
- SPA rewriteは`/api/*`と`/manga/*`を除外する。`manga/index.json`、metadata、画像のすべてにTrusted Key Groupを設定し、SPA本体を認証必須にしていない。[infra/lib/distribution.ts](../infra/lib/distribution.ts) 23–47行、118–200行
- 404を認証403と区別するための`ListBucket`は、CloudFront service principal、当該Distribution ARN、`manga/*` prefixに限定されている。[infra/lib/distribution.ts](../infra/lib/distribution.ts) 202–215行
- 閲覧Cookieは`/manga/*`専用CloudFront Custom Policy、管理Cookieは別名・別HMAC鍵・`Path=/api`である。Presign/Completeは管理Cookieを必須にし、閲覧Cookieだけでは通らないtestもある。[backend/shared/cloudfront-cookies.ts](../backend/shared/cloudfront-cookies.ts) 20–54行、[backend/shared/admin-session.ts](../backend/shared/admin-session.ts) 3–92行、[backend/test/upload.test.ts](../backend/test/upload.test.ts) 166–179行
- password導出値・CloudFront private key・管理署名鍵は実行時にSSM SecureStringから取得し、Lambda IAMはfunctionごとに必要なparameterとS3 action/prefixへ限定されている。[infra/lib/api.ts](../infra/lib/api.ts) 84–221行、[backend/shared/parameters.ts](../backend/shared/parameters.ts) 7–31行
- PresignはID、filename、content typeをallow-list検証し、Clientの完成済みKeyを信用せず`manga/{work}/{chapter}/{page}`をServer側で構築する。[backend/shared/upload.ts](../backend/shared/upload.ts) 23–85行
- Complete APIは全画像をS3で再確認してからmetadata/indexを公開し、indexはETag条件付きPUTと再試行でlost updateを避ける。壊れた既存indexを空として上書きしない。[backend/functions/complete-upload.ts](../backend/functions/complete-upload.ts) 62–90行、117–164行、250–270行
- 大量画像はBrowserでWebPへ変換し、5並列のqueueからPresigned PUTでS3へ直接送る。Lambdaにbinaryを通さず、queueはBlobを保持しない。[frontend/src/upload/uploadManager.ts](../frontend/src/upload/uploadManager.ts) 150–227行、[frontend/src/upload/webp.ts](../frontend/src/upload/webp.ts) 12–37行
- Viewerは正常な画像へ余分なrequestを出さず、画像error時だけHEADして認証切れ、404、通信失敗を分類する。[frontend/src/manga/api.ts](../frontend/src/manga/api.ts) 138–158行
- CDK appは`ap-northeast-1`を固定し、READMEのSSM、bootstrap、2段階deploy手順も同region・同parameter名で整合している。[infra/bin/app.ts](../infra/bin/app.ts) 7–14行、[README.md](../README.md) 108–169行
- PowerShell scriptはWindows PowerShell 5.1にない`ArgumentList`を使わず、passwordをcommand lineに置かずstdinでNodeへ渡し、BOMなしUTF-8でhash/keyを保存する。[scripts/prepare-secrets.ps1](../scripts/prepare-secrets.ps1) 17–75行
- synth testは禁止resource、S3 public access/OAC、Key Group、API cache無効、log/versioning無効、LogGroupの7日保持を確認している。[infra/test/manga-stack.test.ts](../infra/test/manga-stack.test.ts) 7–234行

## テスト、性能、コストの残存リスク

- page数200のtestはあるが、上記の1,000/10,000ページchapterのkey整合性testがない。最大10,000枚の解析testは、実S3上でのPresign/PUT/Complete一連のE2Eではない。
- Viewerの画像error分類はAPI unit testのみで、403時の再ログイン導線、404表示、chapter遷移中の古いHEAD結果を含むcomponent testがない。[frontend/src/manga/api.test.ts](../frontend/src/manga/api.test.ts) 60–75行、[frontend/src/pages/works/[workId]/[chapterId].vue](../frontend/src/pages/works/[workId]/[chapterId].vue) 69–78行
- CloudFront Signed Cookie、OAC、S3 CORS preflight、Set-CookieのBrowser受理はsynth/unit testでは証明できない。READMEのdeploy後checklistで実AWS E2Eが必要である。[README.md](../README.md) 195–209行
- `PRICE_CLASS_100`は料金を抑える意図に整合する一方、対象外地域のviewerは低速になり得る。日本中心であることを前提に、初回deploy後に実測し、必要なら料金差を確認してPrice Classを見直す。[infra/lib/distribution.ts](../infra/lib/distribution.ts) 118–124行
- 禁止された固定費resource（NAT、ALB、EC2/ECS/Fargate、RDS、DynamoDB、Cognito、WAF、Secrets Manager、Route 53、ACM）はtemplate testで除外されている。CDK bootstrapが作るasset bucket/ECR等と、CloudFront/S3/API Gateway/Lambda/SSM/CloudWatchの従量費はREADMEどおりdeploy後にBillingで確認する必要がある。[infra/test/manga-stack.test.ts](../infra/test/manga-stack.test.ts) 7–23行、206–234行、[README.md](../README.md) 252–307行

## 秘密情報確認

- Git管理対象（`secrets/`、依存物、生成物を除外）にAWS access key形式またはPEM private key markerは見つからなかった。SSM parameter名はsourceとdocsに存在するが、値は含まれない。
- Git履歴についても、AWS access key形式および代表的なPEM private key markerの差分検索で該当commitは出力されなかった。

## deploy後にのみ確認できる事項

- 未ログイン・期限切れCookieの`/manga/*`が403で、閲覧ログイン後だけ200になること
- Manga BucketのS3 object URLが常に403になること
- CloudFront経由のSet-CookieがBrowserで保存され、画像・metadata取得に利用されること
- 初回deploy後、`UploadAllowedOrigin=SiteUrl`を渡す2回目deployの後にS3 CORS preflightとPresigned PUTが成功すること
- 実AWSで1,000ページ以上のchapterを含む作品をUpload・Complete・閲覧できること（Medium修正後）
- CloudWatch Logsにpassword、private key、Cookie、Presigned URLが出ないこと
- 実際に作成されたresourceと請求がREADMEの想定から逸脱していないこと
