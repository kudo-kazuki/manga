import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import '@/scss/style.scss'
import 'animate.css'
import App from '@/App.vue'
import router from '@/router'
import ElementPlus from 'element-plus'
import ja from 'element-plus/es/locale/lang/ja'
import axios from 'axios'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

axios.defaults.baseURL = import.meta.env.VITE_API_BASE_URL

const app = createApp(App)
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

app.use(pinia)
app.use(router)
app.use(ElementPlus, { locale: ja })

await router.isReady()

app.mount('#app')
