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

const sfProRounded = localFont({
  src: [
    {
      path: './fonts/sf-pro-rounded/SF-Pro-Rounded-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: './fonts/sf-pro-rounded/SF-Pro-Rounded-Medium.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: './fonts/sf-pro-rounded/SF-Pro-Rounded-Semibold.woff2',
      weight: '600',
      style: 'normal',
    },
    {
      path: './fonts/sf-pro-rounded/SF-Pro-Rounded-Bold.woff2',
      weight: '700',
      style: 'normal',
    },
    {
      path: './fonts/sf-pro-rounded/SF-Pro-Rounded-Heavy.woff2',
      weight: '800',
      style: 'normal',
    },
  ],
  variable: '--font-sf-rounded',
  display: 'swap',
})

const siteTitle = 'Kresco - Plateforme E-Learning'
const siteDescription = 'Preparez vos cours avec des videos, des quiz interactifs et un suivi personnalise.'
const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kresco.ma')
const releaseSha = process.env.NEXT_PUBLIC_RELEASE_SHA ?? 'development'

export const metadata: Metadata = {
  metadataBase: siteUrl,
  applicationName: 'Kresco',
  title: {
    default: siteTitle,
    template: '%s - Kresco',
  },
  description: siteDescription,
  keywords: [
    'Kresco',
    'cours Maroc',
    'cours video',
    'quiz interactifs',
    'plateforme e-learning',
  ],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'Kresco',
    title: siteTitle,
    description: siteDescription,
    locale: 'fr_MA',
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
  },
  robots: {
    index: true,
    follow: true,
  },
  other: {
    'kresco:release': releaseSha,
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await headers()

  return (
    <html lang="fr" data-release={releaseSha}>
      <body className={`${sfProRounded.variable} ${sunghyunSans.variable} antialiased`}>
        <ApiDataProvider>
          {children}
        </ApiDataProvider>
        <ClientErrorReporter />
        <AppToaster />
      </body>
    </html>
  )
}
