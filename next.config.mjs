/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  output: 'standalone',
  // Keep dd-trace and its native/optional deps out of the webpack/Turbopack bundle.
  // dd-trace relies on require() monkey-patching which breaks when bundled.
  serverExternalPackages: [
    'dd-trace',
    '@datadog/native-metrics',
    '@datadog/pprof',
    '@datadog/native-appsec',
    '@datadog/native-iast-taint-tracking',
    '@datadog/native-iast-rewriter',
    '@datadog/openfeature-node-server',
    '@openfeature/server-sdk',
  ],
  transpilePackages: ['motion'],
  // Empty turbopack config silences the Next.js 16 "webpack config without turbopack" error.
  // The webpack config below is still used for custom watchOptions (AI Studio HMR setting).
  turbopack: {},
  webpack: (config, { dev }) => {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modify this watcher setting.
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default nextConfig;
