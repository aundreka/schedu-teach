import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Screenshots are pre-sized PNGs in /public; serve them as-is so local
  // dev/preview never depends on a native image-optimization toolchain.
  images: { unoptimized: true },
}

export default nextConfig
