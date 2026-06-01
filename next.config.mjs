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
  ],
}

export default nextConfig
