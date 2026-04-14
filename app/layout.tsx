import React from "react"
import type { Metadata, Viewport } from 'next'
import { DM_Sans, Outfit, JetBrains_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

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

export const metadata: Metadata = {
  title: 'Tesseract - The platform to ship',
  description: 'The platform for modern teams. Securely build, deploy, and scale the best experiences.',
  generator: 'v0.app',
  keywords: ['platform', 'development', 'deployment', 'scaling', 'infrastructure', 'teams'],
  authors: [{ name: 'Tesseract' }],
  openGraph: {
    title: 'Tesseract - The platform to ship',
    description: 'The platform for modern teams. Securely build, deploy, and scale the best experiences.',
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
    <html lang="en" className="bg-background">
      <body className={`${dmSans.variable} ${outfit.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
