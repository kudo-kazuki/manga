import type { InjectionKey, Ref } from 'vue'

export const appScrollStateKey: InjectionKey<Readonly<Ref<boolean>>> = Symbol('appScrollState')
