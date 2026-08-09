import React from "react"
import type { Metadata, Viewport } from 'next'
import { DM_Sans, Outfit, JetBrains_Mono, Fraunces } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

// Vercel Analytics is only useful when deployed to Vercel — locally, the
// /_vercel/insights/script.js endpoint is missing and the browser shows a
// 404 in the console. Skip the component when not on Vercel.
const ANALYTICS_ENABLED = !!process.env.VERCEL || process.env.NEXT_PUBLIC_VERCEL_ANALYTICS === 'true'

const dmSans = DM_Sans({ 
  subsets: ["latin"],
  variable: '--font-dm-sans',
  weight: ['400', '500', '600', '700']
});

const outfit = Outfit({ 
  subsets: ["latin"],
  variable: '--font-outfit',
  weight: ['400', '500', '600', '700', '800']
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: '--font-jetbrains'
});

// High-contrast transitional serif for marketing/hero accents (Carta-style).
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-fraunces'
});

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
        </ThemeProvider>
        {ANALYTICS_ENABLED && <Analytics />}
      </body>
    </html>
  )
}
