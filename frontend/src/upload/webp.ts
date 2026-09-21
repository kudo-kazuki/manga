export async function convertImageToWebp(
    file: File,
    quality: number,
): Promise<Blob> {
    if (!/^image\/(?:jpeg|png)$/i.test(file.type)) {
        throw new Error('JPEG/PNG画像ではありません。')
    }
    if (!Number.isFinite(quality) || quality < 0.1 || quality > 1) {
        throw new Error('WebP品質は0.1～1の範囲で指定してください。')
    }

    // 1画像だけdecodeし、変換終了時にbitmapとcanvasの参照を必ず解放する。
    const bitmap = await createImageBitmap(file, {
        imageOrientation: 'from-image',
    })
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    try {
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Canvasを初期化できませんでした。')
        context.drawImage(bitmap, 0, 0)
        return await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
                (blob) =>
                    blob
                        ? resolve(blob)
                        : reject(new Error('WebP変換に失敗しました。')),
                'image/webp',
                quality,
            ),
        )
    } finally {
        bitmap.close()
        canvas.width = 0
        canvas.height = 0
    }
}
