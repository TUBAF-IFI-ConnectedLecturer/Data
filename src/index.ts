import { createApp } from 'vue'

import { createVuetify } from 'vuetify'
import { aliases, mdi } from '../node_modules/vuetify/lib/iconsets/mdi'

import * as components from '../node_modules/vuetify/lib/components/index'
import * as directives from '../node_modules/vuetify/lib/directives/index'

import App from './views/App.vue'

const vuetify = createVuetify({
  components: { ...components },
  directives: { ...directives },
  theme: {
    defaultTheme: 'dark',
    themes: {
      light: {
        dark: false,
        colors: {
          primary: '#1976D2',
          secondary: '#424242',
          accent: '#82B1FF',
          error: '#FF5252',
          info: '#2196F3',
          success: '#4CAF50',
          warning: '#FB8C00',
        },
      },
      dark: {
        dark: true,
        colors: {
          primary: '#2196F3',
          secondary: '#424242',
          accent: '#FF4081',
          error: '#FF5252',
          info: '#2196F3',
          success: '#4CAF50',
          warning: '#FB8C00',
        },
      },
    },
  },
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
