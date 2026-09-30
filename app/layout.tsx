import React from "react"
import type { Metadata, Viewport } from 'next'
import { ThemeProvider } from '@/components/theme-provider'
import { CookieConsent } from '@/components/legal/cookie-consent'
import { ConsentedAnalytics } from '@/components/legal/consented-analytics'
import './globals.css'

// Vercel Analytics is only useful when deployed to Vercel — locally, the
// /_vercel/insights/script.js endpoint is missing and the browser shows a
// 404 in the console. Skip the component when not on Vercel.
const ANALYTICS_ENABLED = !!process.env.VERCEL || process.env.NEXT_PUBLIC_VERCEL_ANALYTICS === 'true'

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
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <CookieConsent />
        </ThemeProvider>
        {ANALYTICS_ENABLED && <ConsentedAnalytics />}
      </body>
    </html>
  )
}
