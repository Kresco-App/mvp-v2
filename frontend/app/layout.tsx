import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { headers } from 'next/headers'
import AppToaster from '@/components/AppToaster'
import ApiDataProvider from '@/components/ApiDataProvider'
import ClientErrorReporter from '@/components/ClientErrorReporter'
import './globals.css'

const sunghyunSans = localFont({
  src: [
    {
      path: './fonts/sunghyun-sans/SunghyunSans-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: './fonts/sunghyun-sans/SunghyunSans-SemiBold.woff2',
      weight: '600',
      style: 'normal',
    },
    {
      path: './fonts/sunghyun-sans/SunghyunSans-Bold.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-sunghyun-sans',
  display: 'swap',
})

function getSiteUrl() {
  const configuredUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kresco.ma')
  return new URL('/', configuredUrl.origin)
}

const siteName = 'Kresco'
const siteTitle = 'Kresco - Plateforme E-Learning'
const siteDescription = 'Preparez le Bac au Maroc avec des cours video, quiz interactifs, exercices, examens blancs et suivi personnalise.'
const siteUrl = getSiteUrl()
const siteOrigin = siteUrl.origin
const siteLanguage = 'fr-MA'
const siteImageUrl = new URL('/mascot/mascot.jpeg', siteOrigin).href
const releaseSha = process.env.NEXT_PUBLIC_RELEASE_SHA ?? 'development'
const organizationId = `${siteOrigin}/#organization`
const websiteId = `${siteOrigin}/#website`
const webApplicationId = `${siteOrigin}/#web-application`
const rootPageId = `${siteOrigin}/#home`
const seoKeywords = [
  'Kresco',
  'Kresco Academia',
  'cours Bac Maroc',
  'preparation Bac Maroc',
  'cours video Bac',
  'quiz interactifs',
  'examens blancs',
  'plateforme e-learning Maroc',
]
const siteStructuredData = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'EducationalOrganization',
      '@id': organizationId,
      name: siteName,
      url: siteOrigin,
      description: siteDescription,
      inLanguage: siteLanguage,
      areaServed: {
        '@type': 'Country',
        name: 'Morocco',
      },
      knowsAbout: [
        'Cours video',
        'Quiz interactifs',
        'Preparation Bac Maroc',
        'Examens blancs',
      ],
    },
    {
      '@type': 'WebSite',
      '@id': websiteId,
      name: siteName,
      alternateName: 'Kresco Academia',
      url: siteOrigin,
      description: siteDescription,
      inLanguage: siteLanguage,
      publisher: {
        '@id': organizationId,
      },
    },
    {
      '@type': 'WebApplication',
      '@id': webApplicationId,
      name: siteName,
      url: siteOrigin,
      description: siteDescription,
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Web',
      inLanguage: siteLanguage,
      publisher: {
        '@id': organizationId,
      },
      audience: {
        '@type': 'EducationalAudience',
        educationalRole: 'student',
      },
    },
    {
      '@type': 'WebPage',
      '@id': rootPageId,
      name: siteTitle,
      url: siteUrl.href,
      description: siteDescription,
      inLanguage: siteLanguage,
      isPartOf: {
        '@id': websiteId,
      },
      about: {
        '@id': organizationId,
      },
      mainEntity: {
        '@id': webApplicationId,
      },
    },
  ],
}).replace(/</g, '\\u003c')

export const metadata: Metadata = {
  metadataBase: siteUrl,
  applicationName: siteName,
  manifest: '/manifest.webmanifest',
  authors: [{ name: siteName }],
  creator: siteName,
  publisher: siteName,
  category: 'education',
  classification: 'Education',
  referrer: 'strict-origin-when-cross-origin',
  formatDetection: {
    telephone: false,
  },
  title: {
    default: siteTitle,
    template: '%s - Kresco',
  },
  description: siteDescription,
  keywords: seoKeywords,
  alternates: {
    canonical: '/',
    languages: {
      'fr-MA': '/',
      fr: '/',
      'x-default': '/',
    },
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName,
    title: siteTitle,
    description: siteDescription,
    locale: 'fr_MA',
    alternateLocale: ['fr_FR'],
    images: [{ url: siteImageUrl, alt: siteName }],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
    images: [siteImageUrl],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  other: {
    'kresco:release': releaseSha,
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers()
  const nonce = requestHeaders.get('x-nonce') ?? undefined

  return (
    <html lang="fr" data-release={releaseSha} className={`${sunghyunSans.variable} antialiased`}>
      <body className="antialiased">
        <a href="#main-content" className="skip-link">
          Aller au contenu
        </a>
        <script
          id="kresco-root-jsonld"
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: siteStructuredData }}
        />
        <ApiDataProvider>
          {children}
        </ApiDataProvider>
        <ClientErrorReporter />
        <AppToaster />
      </body>
    </html>
  )
}
