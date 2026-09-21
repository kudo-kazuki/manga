import { reactive } from 'vue'

interface MaterialsAccordionState {
    plotOpen: boolean
    mediumOpen: boolean
    shortOpen: boolean
}

const states = new Map<string, MaterialsAccordionState>()

export const useMaterialsAccordionState = (workId: string) => {
    const existing = states.get(workId)
    if (existing) return existing

    const state = reactive<MaterialsAccordionState>({
        plotOpen: false,
        mediumOpen: false,
        shortOpen: false,
    })
    states.set(workId, state)
    return state
}
