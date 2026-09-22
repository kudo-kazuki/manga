import { naturalSort } from '@/utils/naturalSort'
import type {
    ParsedChapter,
    ParsedPage,
    ParsedWork,
    RelativeImageFile,
} from './types'

const IMAGE_EXTENSION = /\.(?:jpe?g|png)$/i

interface LegacyFileEntry {
    readonly isFile: true
    readonly isDirectory: false
    readonly name: string
    file(
        success: (file: File) => void,
        failure?: (error: DOMException) => void,
    ): void
}

interface LegacyDirectoryReader {
    readEntries(
        success: (entries: LegacyEntry[]) => void,
        failure?: (error: DOMException) => void,
    ): void
}

interface LegacyDirectoryEntry {
    readonly isFile: false
    readonly isDirectory: true
    readonly name: string
    createReader(): LegacyDirectoryReader
}

type LegacyEntry = LegacyFileEntry | LegacyDirectoryEntry
type ItemWithEntry = {
    webkitGetAsEntry?: () => LegacyEntry | null
}

function padId(index: number): string {
    // 総数に依存させず、1～999は3桁、1000以降はそのまま4桁以上にする。
    // 同じpage番号がchapterの総page数によって別名になると、Backendの存在確認と一致しない。
    return String(index + 1).padStart(3, '0')
}

function stableHash(value: string): string {
    // 日本語だけの作品名でも安全なASCII IDを作れるよう、小さなFNV-1a hashをsuffixに使う。
    let hash = 0x811c9dc5
    for (const byte of new TextEncoder().encode(value)) {
        hash ^= byte
        hash = Math.imul(hash, 0x01000193)
    }
    return (hash >>> 0).toString(36)
}

export function createWorkId(title: string): string {
    const ascii = title
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48)
    return `${ascii || 'work'}-${stableHash(title)}`
}

export function parseWorkFiles(
    files: readonly RelativeImageFile[],
): ParsedWork {
    if (files.length === 0) throw new Error('作品フォルダが空です。')

    const warnings: string[] = []
    const byChapter = new Map<string, RelativeImageFile[]>()
    let rootName: string | undefined

    for (const source of files) {
        const segments = source.relativePath.replaceAll('\\', '/').split('/')
        if (segments.length !== 3 || segments.some((segment) => !segment)) {
            warnings.push(`想定外の階層を除外しました: ${source.relativePath}`)
            continue
        }
        const [candidateRoot, chapterName, fileName] = segments as [
            string,
            string,
            string,
        ]
        rootName ??= candidateRoot
        if (candidateRoot !== rootName) {
            throw new Error('複数の作品フォルダが含まれています。')
        }
        if (!IMAGE_EXTENSION.test(fileName)) {
            warnings.push(`JPEG/PNG以外を除外しました: ${source.relativePath}`)
            continue
        }
        const chapterFiles = byChapter.get(chapterName) ?? []
        chapterFiles.push(source)
        byChapter.set(chapterName, chapterFiles)
    }

    if (!rootName || byChapter.size === 0) {
        throw new Error('chapterとJPEG/PNG画像を検出できませんでした。')
    }

    const sortedChapters = naturalSort(
        [...byChapter.entries()],
        ([name]) => name,
    )
    const chapters: ParsedChapter[] = sortedChapters.map(
        ([title, chapterFiles], chapterIndex) => {
            const sortedPages = naturalSort(
                chapterFiles,
                ({ file }) => file.name,
            )
            const pages: ParsedPage[] = sortedPages.map((source, pageIndex) => {
                const id = padId(pageIndex)
                return {
                    id,
                    fileName: `${id}.webp`,
                    originalName: source.file.name,
                    relativePath: source.relativePath,
                    file: source.file,
                }
            })
            return {
                id: padId(chapterIndex),
                title,
                pages,
            }
        },
    )

    const imageFiles = chapters.flatMap((chapter) => chapter.pages)
    return {
        id: createWorkId(rootName),
        title: rootName,
        chapters,
        totalImages: imageFiles.length,
        totalBytes: imageFiles.reduce(
            (total, page) => total + page.file.size,
            0,
        ),
        warnings,
    }
}

function readFile(entry: LegacyFileEntry): Promise<File> {
    return new Promise((resolve, reject) => entry.file(resolve, reject))
}

async function readDirectoryEntries(
    entry: LegacyDirectoryEntry,
): Promise<LegacyEntry[]> {
    const reader = entry.createReader()
    const entries: LegacyEntry[] = []
    // Chromiumは1回で全件を返す保証がないため、空配列になるまで繰り返す。
    while (true) {
        const batch = await new Promise<LegacyEntry[]>((resolve, reject) =>
            reader.readEntries(resolve, reject),
        )
        if (batch.length === 0) return entries
        entries.push(...batch)
    }
}

async function walkEntry(
    entry: LegacyEntry,
    parentPath: string,
    output: RelativeImageFile[],
): Promise<void> {
    const path = parentPath ? `${parentPath}/${entry.name}` : entry.name
    if (entry.isFile) {
        output.push({ file: await readFile(entry), relativePath: path })
        return
    }
    for (const child of await readDirectoryEntries(entry)) {
        await walkEntry(child, path, output)
    }
}

export async function collectDroppedFiles(
    dataTransfer: DataTransfer,
): Promise<RelativeImageFile[]> {
    const entries = [...dataTransfer.items]
        // lib.domの古いFileSystemEntry型では必要なmemberが不足するため、実際に使う最小形へ絞る。
        .map((item) => (item as unknown as ItemWithEntry).webkitGetAsEntry?.())
        .filter(
            (entry): entry is LegacyEntry =>
                entry !== null && entry !== undefined,
        )
    if (entries.length !== 1 || !entries[0]?.isDirectory) {
        throw new Error('作品フォルダを1つだけドロップしてください。')
    }

    const output: RelativeImageFile[] = []
    await walkEntry(entries[0], '', output)
    return output
}

export function collectSelectedFiles(files: FileList): RelativeImageFile[] {
    return [...files].map((file) => ({
        file,
        // webkitdirectoryで選択したFileにはルートからの相対pathが入る。
        relativePath: file.webkitRelativePath || file.name,
    }))
}
