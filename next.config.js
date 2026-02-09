/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['cdn.fundsindia.com'],
  },
  experimental: {
    serverActions: true,
  },
}

module.exports = nextConfig
