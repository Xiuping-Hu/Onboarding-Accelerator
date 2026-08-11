/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@onboarding/shared'],
  serverExternalPackages: ['pdf-parse'],
};

export default nextConfig;
