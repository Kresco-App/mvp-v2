import type { Metadata } from 'next'
import localFont from 'next/font/local'
import AppToaster from '@/components/AppToaster'
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
      path: './fonts/sf-pro-rounded/SF-Pro-Rounded-Regular.otf',
      weight: '400',
      style: 'normal',
    },
    {
      path: './fonts/sf-pro-rounded/SF-Pro-Rounded-Medium.otf',
      weight: '500',
      style: 'normal',
    },
    {
      path: './fonts/sf-pro-rounded/SF-Pro-Rounded-Semibold.otf',
      weight: '600',
      style: 'normal',
    },
    {
      path: './fonts/sf-pro-rounded/SF-Pro-Rounded-Bold.otf',
      weight: '700',
      style: 'normal',
    },
    {
      path: './fonts/sf-pro-rounded/SF-Pro-Rounded-Heavy.otf',
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${sfProRounded.variable} ${sunghyunSans.variable} antialiased`}>
        {children}
        <AppToaster />
      </body>
    </html>
  )
}
