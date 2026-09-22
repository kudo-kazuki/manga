import type { UploadFailure, UploadFailureKind } from './uploadManager'

export interface FailurePresentation {
    readonly title: string
    readonly description: string
    readonly recommendation: string
    readonly kinds: readonly UploadFailureKind[]
}

const kindLabels: Record<UploadFailureKind, string> = {
    presign: 'アップロード準備',
    conversion: 'WebP変換',
    's3-upload': 'S3への送信',
}

export const formatFailureKind = (kind: UploadFailureKind): string =>
    kindLabels[kind]

// 例外messageには通信ライブラリやAWSの内部表現が含まれ得るため、画面では分類済みの
// 原因と次の操作を主に伝える。個別messageは管理者が必要なときだけ補助情報として見る。
export const createItemFailurePresentation = (
    failures: readonly UploadFailure[],
): FailurePresentation => {
    const kinds = [...new Set(failures.map((failure) => failure.kind))]
    if (kinds.length > 1) {
        return {
            title: '一部の画像を処理できませんでした',
            description: `${failures.length}件の画像で、複数種類のエラーが発生しました。`,
            recommendation:
                '下の失敗一覧を確認し、まず「失敗した画像を再試行」を押してください。変換できない画像だけが残る場合は、元ファイルを開いて破損していないか確認してください。',
            kinds,
        }
    }

    switch (kinds[0]) {
        case 'presign':
            return {
                title: 'アップロードの準備に失敗しました',
                description: `${failures.length}件分のUpload URLを取得できませんでした。`,
                recommendation:
                    'ネットワーク接続を確認してから「失敗した画像を再試行」を押してください。管理画面を長時間開いていた場合は、再ログイン後にやり直してください。',
                kinds,
            }
        case 'conversion':
            return {
                title: '画像をWebPへ変換できませんでした',
                description: `${failures.length}件の画像をブラウザで読み込めませんでした。`,
                recommendation:
                    'まず「失敗した画像を再試行」を押してください。同じ画像だけが残る場合は、元ファイルが壊れていないか確認し、差し替え後にフォルダを選び直してください。',
                kinds,
            }
        case 's3-upload':
            return {
                title: 'S3への画像送信に失敗しました',
                description: `${failures.length}件のWebP画像を保存できませんでした。`,
                recommendation:
                    'ネットワーク接続を確認してから「失敗した画像を再試行」を押してください。失敗した画像だけを新しいUpload URLで変換・送信し直します。',
                kinds,
            }
        default:
            return {
                title: 'アップロードに失敗しました',
                description: `${failures.length}件の画像を処理できませんでした。`,
                recommendation:
                    'ネットワーク接続と画像ファイルを確認してから、失敗した画像を再試行してください。',
                kinds,
            }
    }
}

export const createCompletionFailurePresentation = (
    isObjectConfirmationPending: boolean,
): FailurePresentation => ({
    title: '公開情報を確定できませんでした',
    description: isObjectConfirmationPending
        ? '画像の送信は完了しましたが、S3での確認がまだ終わっていません。'
        : '画像の送信は完了しましたが、作品情報の公開に失敗しました。',
    recommendation: isObjectConfirmationPending
        ? '1分ほど待ってから「metadata確定を再試行」を押してください。画像を再送信する必要はありません。'
        : '「metadata確定を再試行」を押してください。繰り返し失敗する場合は、管理画面を再読み込みして再ログイン後に試してください。',
    kinds: [],
})

// ここへ到達するのは通常の画像単位エラーやmetadataエラー以外の想定外例外だけ。
// 「どの画像が失敗したか」を推測して誤案内しないため、再読み込みから案内する。
export const createUnexpectedFailurePresentation = (): FailurePresentation => ({
    title: 'アップロード処理を続行できませんでした',
    description:
        '予期しないエラーが発生したため、処理状況を確定できませんでした。',
    recommendation:
        '画面を再読み込みして再ログイン後、フォルダを選び直してください。繰り返し発生する場合は、表示されたエラー内容を控えてください。',
    kinds: [],
})
