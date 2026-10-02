import React from "react"
import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { ThemeProvider } from '@/components/theme-provider'
import { CookieConsent } from '@/components/legal/cookie-consent'
import { ConsentedAnalytics } from '@/components/legal/consented-analytics'
import './globals.css'

// Vercel Analytics is only useful when deployed to Vercel — locally, the
// /_vercel/insights/script.js endpoint is missing and the browser shows a
// 404 in the console. Skip the component when not on Vercel.
const ANALYTICS_ENABLED = !!process.env.VERCEL || process.env.NEXT_PUBLIC_VERCEL_ANALYTICS === 'true'

// Self-hosted (SIL OFL, licences alongside in app/fonts) so builds never depend on
// fetching from Google; variable-weight latin subsets from Fontsource.
const dmSans = localFont({ src: './fonts/dm-sans-latin-wght-normal.woff2', variable: '--font-dm-sans', weight: '100 1000', display: 'swap' })
const outfit = localFont({ src: './fonts/outfit-latin-wght-normal.woff2', variable: '--font-outfit', weight: '100 900', display: 'swap' })
const jetbrainsMono = localFont({ src: './fonts/jetbrains-mono-latin-wght-normal.woff2', variable: '--font-jetbrains', weight: '100 800', display: 'swap' })
const fraunces = localFont({
  src: [
    { path: './fonts/fraunces-latin-wght-normal.woff2', style: 'normal', weight: '100 900' },
    { path: './fonts/fraunces-latin-wght-italic.woff2', style: 'italic', weight: '100 900' },
  ],
  variable: '--font-fraunces',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Anker AI - The AI platform to build your fundraise',
  description: 'The AI-powered platform for founders to discover investors, manage outreach, and close their fundraise faster.',
  generator: 'v0.app',
  keywords: ['fundraising', 'investors', 'startup', 'AI', 'venture capital', 'pitch deck', 'founder', 'seed', 'series a'],
  authors: [{ name: 'Anker AI' }],
  openGraph: {
    title: 'Anker AI - The AI platform to build your fundraise',
    description: 'The AI-powered platform for founders to discover investors, manage outreach, and close their fundraise faster.',
    type: 'website',
  },
}

export const viewport: Viewport = {
  themeColor: '#fafafa',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background" suppressHydrationWarning>
      <body className={`${dmSans.variable} ${outfit.variable} ${jetbrainsMono.variable} ${fraunces.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <CookieConsent />
        </ThemeProvider>
        {ANALYTICS_ENABLED && <ConsentedAnalytics />}
      </body>
    </html>
  )
}
