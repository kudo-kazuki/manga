import { computed, type Ref, type ComputedRef } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { BREAKPOINTS } from '@/constants/breakpoints'

export type DeviceType = 'pc' | 'tablet' | 'sp'

export function useWindowSizeAndDevice(): {
    width: Ref<number>
    height: Ref<number>
    deviceType: ComputedRef<DeviceType>
} {
    const { width, height } = useWindowSize()

    const deviceType = computed<DeviceType>(() => {
        if (width.value >= BREAKPOINTS.PC) {
            return 'pc'
        } else if (width.value > BREAKPOINTS.TABLET) {
            return 'tablet'
        } else {
            return 'sp'
        }
    })

    return {
        width,
        height,
        deviceType,
    }
}
