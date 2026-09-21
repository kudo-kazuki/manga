declare module '*.vue' {
    import type { DefineComponent } from 'vue'
    const component: DefineComponent<{}, {}, any>
    export default component
}

declare module '*.css' {
    const content: { [className: string]: string }
    export default content
}

declare module '*.scss' {
    const content: { [className: string]: string }
    export default content
}

declare module '*.png' {
    const value: string
    export default value
}
