import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { headers } from 'next/headers'
import AppToaster from '@/components/AppToaster'
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
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://kresco.ma'

  try {
    return new URL('/', new URL(configuredUrl).origin)
  } catch {
    return new URL('https://kresco.ma')
  }
}

const siteName = 'Kresco'
const siteTitle = 'Kresco - Plateforme E-Learning'
const siteDescription = 'Preparez le Bac au Maroc avec des cours video, quiz interactifs, exercices, examens blancs et suivi personnalise.'
const siteUrl = getSiteUrl()
const siteOrigin = siteUrl.origin
const siteLanguage = 'fr-MA'
const siteImage = {
  url: new URL('/mascot/mascot.jpeg', siteOrigin).href,
  width: 1124,
  height: 1600,
  type: 'image/jpeg',
  alt: 'Kresco education mascot for Bac preparation',
}
const releaseSha = process.env.NEXT_PUBLIC_RELEASE_SHA ?? 'development'
const organizationId = `${siteOrigin}/#organization`
const websiteId = `${siteOrigin}/#website`
const webApplicationId = `${siteOrigin}/#web-application`
const rootPageId = `${siteOrigin}/#home`
const primaryImageId = `${siteOrigin}/#primary-image`
const breadcrumbId = `${siteOrigin}/#breadcrumb`
const educationalAudience = {
  '@type': 'EducationalAudience',
  educationalRole: 'student',
  audienceType: 'Moroccan Bac students',
}
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
      alternateName: 'Kresco Academia',
      url: siteUrl.href,
      description: siteDescription,
      inLanguage: siteLanguage,
      image: {
        '@id': primaryImageId,
      },
      areaServed: {
        '@type': 'Country',
        name: 'Morocco',
      },
      audience: educationalAudience,
      knowsAbout: [
        'Cours video',
        'Quiz interactifs',
        'Preparation Bac Maroc',
        'Examens blancs',
      ],
    },
    {
      '@type': 'ImageObject',
      '@id': primaryImageId,
      url: siteImage.url,
      contentUrl: siteImage.url,
      width: siteImage.width,
      height: siteImage.height,
      encodingFormat: siteImage.type,
      caption: siteImage.alt,
      inLanguage: siteLanguage,
    },
    {
      '@type': 'WebSite',
      '@id': websiteId,
      name: siteName,
      alternateName: 'Kresco Academia',
      url: siteUrl.href,
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
      url: siteUrl.href,
      description: siteDescription,
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Web',
      inLanguage: siteLanguage,
      featureList: [
        'Cours video pour le Bac',
        'Quiz interactifs',
        'Exercices corriges',
        'Examens blancs',
        'Suivi personnalise',
      ],
      publisher: {
        '@id': organizationId,
      },
      audience: educationalAudience,
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
      primaryImageOfPage: {
        '@id': primaryImageId,
      },
      breadcrumb: {
        '@id': breadcrumbId,
      },
      audience: educationalAudience,
      mainEntity: {
        '@id': webApplicationId,
      },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': breadcrumbId,
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: siteName,
          item: siteUrl.href,
        },
      ],
    },
  ],
}).replace(/</g, '\\u003c')

export const metadata: Metadata = {
  metadataBase: siteUrl,
  applicationName: siteName,
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
  },
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
    images: [siteImage],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
    images: [{ url: siteImage.url, alt: siteImage.alt }],
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
          suppressHydrationWarning
          type="application/ld+json"
        >
          {siteStructuredData}
        </script>
        {children}
        <ClientErrorReporter />
        <AppToaster />
      </body>
    </html>
  )
}
