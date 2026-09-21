# Phase 5: metadata / 作品一覧 / Viewer 実装記録

## 1. Upload完了処理

`POST /api/upload/complete` を追加した。管理画面は全画像のPUT成功後だけ次の情報を送る。

```json
{
    "workId": "baburios-abc123",
    "title": "バブリオス",
    "chapters": [{ "id": "001", "title": "1巻", "pages": 200 }]
}
```

Backendは管理session Cookieとrequest schemaを再検証し、Clientの成功報告だけを信用せず、S3の作品prefixをpagination付きで一覧する。期待する全画像Keyが存在し、sizeが0より大きい場合だけ次の順で公開する。

```text
画像存在確認
  -> manga/{workId}/metadata.json
  -> manga/index.json
```

画像が1件でも不足する場合はHTTP 409を返し、metadataもindexも書かない。Clientは画像を再Uploadせずcomplete APIだけを再試行できる。

## 2. index競合対策

`manga/index.json` はDBを使わずread-modify-writeするため、複数作品の完了が重なるとlost updateが起き得る。これを防ぐため、既存indexのETagを `If-Match`、初回作成を `If-None-Match: *` とした条件付きPUTを使う。

HTTP 412になった場合は最新indexを再読込して最大4回再試行する。同じ作品のcompleteを再送した場合はwork IDで置換するため、indexへ重複しない。既存indexが壊れている場合は空indexとして上書きせず、HTTP 500で停止して既存作品を保護する。

Complete Lambdaの権限は次に限定した。

- 管理署名鍵1件のSSM `GetParameter`
- 漫画Bucketの `manga/*` を対象とする `ListBucket`
- `manga/index.json` の `GetObject`
- `manga/index.json` と `manga/*/metadata.json` の `PutObject`

画像objectを削除・上書きする権限は与えていない。

## 3. metadataとcache

metadataは表示用の日本語titleを保持し、ViewerがページURLを組み立てられる最小情報だけを保存する。

```json
{
    "id": "baburios-abc123",
    "title": "バブリオス",
    "chapters": [{ "id": "001", "title": "1巻", "pages": 200 }],
    "updatedAt": "2026-09-21T12:00:00.000Z"
}
```

画像用CloudFront cacheとは別に、`manga/index.json` と `manga/*/metadata.json` へ60秒の短期cache policyを設定した。どちらも既存のTrusted Key Groupで保護され、Signed Cookieなしでは取得できない。

## 4. 閲覧画面

次の画面をprivate JSONへ接続した。

- `/`: `manga/index.json` を使った作品一覧
- `/works/:workId`: `metadata.json` を使ったchapter一覧
- `/works/:workId/:chapterId`: 縦スクロールViewer

Viewerはmetadataのpage数から `001.webp` 形式のURLをBrowser側で組み立てる。URL一覧をBackendへ問い合わせない。最初の2画像以外は `loading="lazy"`、全画像に `decoding="async"` を指定し、一度に全ページをdecodeしにくい構成にした。前後chapterへの移動にも対応した。

private JSONの401/403は閲覧session切れとして元URL付きでログイン画面へ誘導する。metadata破損、404、network errorは別のエラーとして扱う。画像読み込み失敗時は、閲覧中にCookieが切れた可能性を案内して再ログイン導線を表示する。

## 5. SSM Parameter

Phase 5で新しいSSM Parameterは増えない。Complete Lambdaは既存の次の値を参照する。

```text
/manga/admin-signing-key
```

## 6. 確認結果

- Backend typecheck成功
- Backend unit test 32件成功
- Frontend type-check成功
- Frontend unit test 29件成功
- Frontend ESLint成功
- Frontend production build成功
- Infra typecheck成功
- Infra unit test 4件成功
- CDK synth成功
- 画像不足時にmetadata/indexを書かないことをunit testで確認
- index競合時に他作品を保持することをunit testで確認
- complete再送時に作品が重複しないことをunit testで確認
- 漫画Bucketの `RETAIN` と禁止AWSサービス0件を維持

AWSへのdeployと実S3を使ったE2E確認はこの時点では実行していない。
