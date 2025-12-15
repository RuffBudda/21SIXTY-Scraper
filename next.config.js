/** @type {import('next').NextConfig} */
const nextConfig = {
  // Production optimizations for droplet deployment
  output: 'standalone',
  poweredByHeader: false,
}

module.exports = nextConfig

