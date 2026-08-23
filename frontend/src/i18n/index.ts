import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'

// English only. Multi-language was cut from scope; i18next stays because every
// page already routes its strings through t(), and a single resource bundle is
// cheaper to keep than to unpick.
i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

document.documentElement.lang = 'en'

export default i18n
