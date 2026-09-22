const SITE_TITLE = '漫画'

// SPAではroute遷移だけではHTMLのtitleが変わらないため、各pageが表示内容に応じて更新する。
export const setDocumentTitle = (pageTitle?: string): void => {
    document.title = pageTitle ? `${pageTitle} | ${SITE_TITLE}` : SITE_TITLE
}

export const useDocumentTitle = (initialTitle: string) => {
    setDocumentTitle(initialTitle)
    return { setDocumentTitle }
}
