/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['src', 'packages', 'functions'],
  serverExternalPackages: ['bcrypt'],
};

export default nextConfig;
