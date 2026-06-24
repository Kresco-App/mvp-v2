import type { MetadataRoute } from 'next'

const siteDescription = 'Preparez vos cours avec des videos, des quiz interactifs et un suivi personnalise.'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Kresco - Plateforme E-Learning',
    short_name: 'Kresco',
    description: siteDescription,
    id: '/',
    lang: 'fr',
    categories: ['education'],
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#fbfbfc',
    theme_color: '#453dee',
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
        purpose: 'any',
      },
    ],
  }
}
