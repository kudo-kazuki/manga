export interface RelativeImageFile {
    readonly file: File
    readonly relativePath: string
}

export interface ParsedPage {
    readonly id: string
    readonly fileName: string
    readonly originalName: string
    readonly relativePath: string
    readonly file: File
}

export interface ParsedChapter {
    readonly id: string
    readonly title: string
    readonly pages: readonly ParsedPage[]
}

export interface ParsedWork {
    readonly id: string
    readonly title: string
    readonly chapters: readonly ParsedChapter[]
    readonly totalImages: number
    readonly totalBytes: number
    readonly warnings: readonly string[]
}

export type ConversionStatus =
    'pending' | 'converting' | 'uploading' | 'succeeded' | 'failed'

export interface ConversionItem {
    readonly page: ParsedPage
    status: ConversionStatus
    convertedBytes?: number
    error?: string
}
