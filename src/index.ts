import { createApp } from 'vue'

import { createVuetify } from 'vuetify'
import { aliases, mdi } from '../node_modules/vuetify/lib/iconsets/mdi'

import * as components from '../node_modules/vuetify/lib/components/index'
import * as directives from '../node_modules/vuetify/lib/directives/index'

import App from './views/App.vue'

const vuetify = createVuetify({
  components: { ...components },
  directives: { ...directives },
  theme: { defaultTheme: 'dark' },
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: {
      mdi,
    },
  },
})

const app = createApp(App)

app.use(vuetify)
app.mount(document.body)
