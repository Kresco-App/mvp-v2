import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { connection } from 'next/server'
import AppToaster from '@/components/AppToaster'
import ApiDataProvider from '@/components/ApiDataProvider'
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

export const metadata: Metadata = {
  title: 'Kresco — Plateforme E-Learning',
  description: 'Preparez votre Bac avec des cours video, des quiz interactifs et un suivi personnalise.',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection()

  return (
    <html lang="fr">
      <body className={`${sfProRounded.variable} ${sunghyunSans.variable} antialiased`}>
        <ApiDataProvider>
          {children}
        </ApiDataProvider>
        <AppToaster />
      </body>
    </html>
  )
}
