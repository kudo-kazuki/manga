// 数字部分を数値として比較し、1・2・10の順を保つ。日本語のchapter名にもそのまま使える。
const naturalCollator = new Intl.Collator('ja', {
    numeric: true,
    sensitivity: 'base',
})

export function naturalCompare(left: string, right: string): number {
    return naturalCollator.compare(left, right)
}

export function naturalSort<T>(
    values: readonly T[],
    selector: (value: T) => string,
): T[] {
    return [...values].sort((left, right) =>
        naturalCompare(selector(left), selector(right)),
    )
}
