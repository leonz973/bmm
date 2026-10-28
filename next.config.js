import nextConst from 'next/constants.js';
import { checkEnvs, tryLoadParentGitRepoEnv } from './scripts/utils.mjs';

let codeInspectorPlugin;
if (process.env.NODE_ENV === 'development') {
  const { codeInspectorPlugin: plugin } = await import('code-inspector-plugin');
  codeInspectorPlugin = plugin;
}

export default async function setup(phase) {
  tryLoadParentGitRepoEnv()

  if (phase === nextConst.PHASE_DEVELOPMENT_SERVER || phase === nextConst.PHASE_PRODUCTION_SERVER) {
    checkEnvs()
  }

  // 仅当显式配置了 AUTH_URL 时才限制 Server Actions 的来源，否则交给 Next 按请求 Host 判断
  const domainHost = process.env.AUTH_URL ? new URL(process.env.AUTH_URL).host : undefined

  /** @type {import('next').NextConfig} */
  const nextConfig = {
    images: {
      remotePatterns: [
        {
          protocol: 'https',
          hostname: '*.iconify.design',
          pathname: '**',
        },
        process.env.NEXT_PUBLIC_WEBSITE_LOGO ? new URL(process.env.NEXT_PUBLIC_WEBSITE_LOGO) : undefined,
      ].filter(Boolean),
      dangerouslyAllowSVG: true,
    },
    turbopack: {
      rules: codeInspectorPlugin ? codeInspectorPlugin({
        bundler: 'turbopack',
        hideDomPathAttr: true,
      }) : undefined
    },
    experimental: {
      ...(domainHost ? { serverActions: { allowedOrigins: [domainHost] } } : {}),
    },
    typescript: {
      ignoreBuildErrors: Boolean(process.env.IGNORE_BUILD_ERRORS),
    },
    allowedDevOrigins: ['127.0.0.1'],
  }
  return nextConfig
}
