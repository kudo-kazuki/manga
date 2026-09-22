import { describe, expect, it } from 'vitest'
import { naturalSort } from '@/utils/naturalSort'
import { createWorkId, parseWorkFiles } from './folderParser'
import type { RelativeImageFile } from './types'

function source(
    path: string,
    size = 100,
    type = 'image/jpeg',
): RelativeImageFile {
    const name = path.split('/').at(-1) ?? path
    return {
        file: new File([new Uint8Array(size)], name, { type }),
        relativePath: path,
    }
}

describe('folder parser', () => {
    it('chapterとpageを自然順に並べてzero paddingする', () => {
        const work = parseWorkFiles([
            source('バブリオス/10巻/10.jpg'),
            source('バブリオス/2巻/2.jpg'),
            source('バブリオス/1巻/10.jpg'),
            source('バブリオス/1巻/1.jpg'),
            source('バブリオス/1巻/2.jpg'),
        ])

        expect(work.title).toBe('バブリオス')
        expect(work.chapters.map(({ title }) => title)).toEqual([
            '1巻',
            '2巻',
            '10巻',
        ])
        expect(work.chapters[0]?.id).toBe('001')
        expect(
            work.chapters[0]?.pages.map(({ originalName }) => originalName),
        ).toEqual(['1.jpg', '2.jpg', '10.jpg'])
        expect(work.chapters[0]?.pages.map(({ fileName }) => fileName)).toEqual(
            ['001.webp', '002.webp', '003.webp'],
        )
    })

    it('日本語表示名を保持しつつ安全なASCII作品IDを作る', () => {
        expect(createWorkId('バブリオス')).toMatch(/^work-[a-z0-9]+$/)
        expect(createWorkId('My Manga 01')).toMatch(/^my-manga-01-[a-z0-9]+$/)
    })

    it('無関係ファイルと想定外階層を警告して除外する', () => {
        const work = parseWorkFiles([
            source('作品/1巻/1.jpg'),
            source('作品/1巻/memo.txt'),
            source('作品/1巻/sub/2.jpg'),
        ])
        expect(work.totalImages).toBe(1)
        expect(work.warnings).toHaveLength(2)
    })

    it('Windows/macOSのsystem fileとAppleDouble画像をpage数へ含めない', () => {
        const work = parseWorkFiles([
            source('作品/1巻/1.jpg'),
            source('作品/1巻/.DS_Store', 1, 'application/octet-stream'),
            source('作品/1巻/Thumbs.db', 1, 'application/octet-stream'),
            source('作品/1巻/desktop.ini', 1, 'text/plain'),
            source('作品/1巻/._2.jpg'),
            source('作品/__MACOSX/2.jpg'),
        ])

        expect(work.totalImages).toBe(1)
        expect(work.chapters).toHaveLength(1)
        expect(work.warnings).toHaveLength(5)
    })

    it('画像拡張子でもMIME typeが非画像なら除外する', () => {
        const work = parseWorkFiles([
            source('作品/1巻/1.jpg'),
            source('作品/1巻/not-image.jpg', 1, 'text/plain'),
        ])

        expect(work.totalImages).toBe(1)
        expect(work.warnings).toEqual([
            'JPEG/PNG以外を除外しました: 作品/1巻/not-image.jpg',
        ])
    })

    it('50 chapter × 200 imagesをdecodeせず解析できる', () => {
        const files: RelativeImageFile[] = []
        for (let chapter = 1; chapter <= 50; chapter += 1) {
            for (let page = 1; page <= 200; page += 1) {
                files.push(source(`大作/${chapter}巻/${page}.jpg`, 1))
            }
        }
        const work = parseWorkFiles(files)
        expect(work.chapters).toHaveLength(50)
        expect(work.totalImages).toBe(10_000)
        expect(work.totalBytes).toBe(10_000)
    })

    it('1000 pagesでも総数に依存せず最低3桁の連番を使う', () => {
        const files = Array.from({ length: 1_000 }, (_, index) =>
            source(`大作/1巻/${index + 1}.jpg`, 1),
        )

        const pages = parseWorkFiles(files).chapters[0]?.pages

        expect(pages?.[0]?.fileName).toBe('001.webp')
        expect(pages?.[998]?.fileName).toBe('999.webp')
        expect(pages?.[999]?.fileName).toBe('1000.webp')
    })

    it('汎用natural sortも1、2、10の順になる', () => {
        expect(
            naturalSort(['10.jpg', '1.jpg', '2.jpg'], (value) => value),
        ).toEqual(['1.jpg', '2.jpg', '10.jpg'])
    })
})
