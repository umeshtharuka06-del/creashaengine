/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async redirects() {
    // Wallet, Profile and Promotions are merged into /mine (single account hub).
    return [
      { source: "/wallet", destination: "/mine", permanent: false },
      { source: "/profile", destination: "/mine", permanent: false },
      { source: "/promotion", destination: "/mine", permanent: false },
    ];
  },
};

export default nextConfig;
