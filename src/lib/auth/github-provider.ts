import GithubProvider from 'next-auth/providers/github'

export type GithubProviderConfig = {
  clientId: string
  clientSecret: string
}

export function createGithubProvider(config: GithubProviderConfig) {
  const provider = GithubProvider({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  })

  // 运行在 Vercel 平台上，不使用代理
  if (!process.env.VERCEL) {
    // 有代理优先使用代理
    provider.token = process.env.FETCH_GITHUB_TOKEN_PROXY || provider.token
  }

  return provider
}
