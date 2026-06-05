/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Keep server-only packages out of client bundles. pdf-parse + docx are
  // CommonJS / Node-only; pg + pglite + neon talk to databases.
  serverExternalPackages: [
    "@electric-sql/pglite",
    "@neondatabase/serverless",
    "pg",
    "pdf-parse",
    "docx",
    // OCR fallback chain: pdfjs-dist is ESM-only legacy build; @napi-rs/canvas
    // loads a native .node binary that must NOT be bundled.  Keeping them in
    // the server runtime as-is avoids the "Cannot find module './skia.*.node'"
    // error from Turbopack at module-eval time.
    "@napi-rs/canvas",
    "pdfjs-dist",
  ],
}

export default nextConfig
