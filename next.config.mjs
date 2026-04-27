/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Keep server-only DB drivers out of client bundles
  serverExternalPackages: ["@electric-sql/pglite", "@neondatabase/serverless"],
}

export default nextConfig
