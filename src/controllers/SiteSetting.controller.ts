import { db, schema } from '@/db'
import { z } from '@/lib/zod'
import { eq } from 'drizzle-orm'

const PROXY_CONFIG_KEY = 'site.proxy'
const AUTH_CONFIG_KEY = 'site.auth'

export const siteProxyConfigSchema = z.object({
  proxyUrl: z.string(),
})

type SiteProxyConfig = z.output<typeof siteProxyConfigSchema>

const defaultProxyConfig: SiteProxyConfig = { proxyUrl: '' }

export const siteAuthConfigSchema = z.object({
  allowRegister: z.boolean().default(true),
  github: z
    .object({
      enabled: z.boolean().default(false),
      clientId: z.string().trim().default(''),
      clientSecret: z.string().default(''),
    })
    .default({ enabled: false, clientId: '', clientSecret: '' }),
})

export type SiteAuthConfig = z.output<typeof siteAuthConfigSchema>

export type SafeSiteAuthConfig = {
  allowRegister: boolean
  github: {
    enabled: boolean
    clientId: string
    hasClientSecret: boolean
    envConfigured: boolean
  }
}

function getEnvGithubCredentials() {
  return {
    clientId: process.env.AUTH_GITHUB_ID?.trim() || '',
    clientSecret: process.env.AUTH_GITHUB_SECRET?.trim() || '',
  }
}

function getDefaultAuthConfig(): SiteAuthConfig {
  const env = getEnvGithubCredentials()
  return {
    allowRegister: true,
    github: {
      enabled: Boolean(env.clientId && env.clientSecret),
      clientId: '',
      clientSecret: '',
    },
  }
}

async function getProxyConfig(): Promise<SiteProxyConfig> {
  const row = await db.query.siteConfigs.findFirst({
    where: eq(schema.siteConfigs.key, PROXY_CONFIG_KEY),
  })
  if (!row) return defaultProxyConfig
  const result = siteProxyConfigSchema.safeParse(row.value)
  return result.success ? result.data : defaultProxyConfig
}

async function saveProxyConfig(input: SiteProxyConfig) {
  const parsed = siteProxyConfigSchema.parse(input)
  const value = parsed as typeof schema.siteConfigs.$inferInsert.value

  await db
    .insert(schema.siteConfigs)
    .values({ key: PROXY_CONFIG_KEY, value, description: '网络代理配置' })
    .onConflictDoUpdate({
      target: schema.siteConfigs.key,
      set: { value, updatedAt: new Date() },
    })

  return parsed
}

async function getProxyUrl(): Promise<string> {
  const config = await getProxyConfig()
  return config.proxyUrl
}

async function getAuthConfig(): Promise<SiteAuthConfig> {
  const row = await db.query.siteConfigs.findFirst({
    where: eq(schema.siteConfigs.key, AUTH_CONFIG_KEY),
  })
  if (!row) return getDefaultAuthConfig()
  const result = siteAuthConfigSchema.safeParse(row.value)
  return result.success ? result.data : getDefaultAuthConfig()
}

function resolveGithubCredentials(github: SiteAuthConfig['github']) {
  if (github.clientId && github.clientSecret) {
    return { clientId: github.clientId, clientSecret: github.clientSecret }
  }
  const env = getEnvGithubCredentials()
  if (!github.clientId && !github.clientSecret && env.clientId && env.clientSecret) return env
  return { clientId: github.clientId, clientSecret: github.clientSecret }
}

function isGithubReady(config: SiteAuthConfig) {
  const credentials = resolveGithubCredentials(config.github)
  return config.github.enabled && Boolean(credentials.clientId && credentials.clientSecret)
}

async function saveAuthConfig(input: SiteAuthConfig): Promise<SafeSiteAuthConfig> {
  const parsed = siteAuthConfigSchema.parse(input)
  const existing = await getAuthConfig()
  const github = {
    enabled: parsed.github.enabled,
    clientId: parsed.github.clientId || existing.github.clientId,
    clientSecret: parsed.github.clientSecret || existing.github.clientSecret,
  }
  const credentials = resolveGithubCredentials(github)
  if (github.enabled && (!credentials.clientId || !credentials.clientSecret)) {
    throw new Error('启用 GitHub 登录前，请填写 Client ID 和 Client Secret')
  }

  const value = {
    allowRegister: parsed.allowRegister,
    github,
  } as typeof schema.siteConfigs.$inferInsert.value

  await db
    .insert(schema.siteConfigs)
    .values({ key: AUTH_CONFIG_KEY, value, description: '登录与注册设置' })
    .onConflictDoUpdate({
      target: schema.siteConfigs.key,
      set: { value, updatedAt: new Date() },
    })

  return await getSafeAuthConfig()
}

async function getSafeAuthConfig(): Promise<SafeSiteAuthConfig> {
  const config = await getAuthConfig()
  const credentials = resolveGithubCredentials(config.github)
  const env = getEnvGithubCredentials()
  return {
    allowRegister: config.allowRegister,
    github: {
      enabled: config.github.enabled,
      clientId: config.github.clientId,
      hasClientSecret: Boolean(credentials.clientSecret),
      envConfigured: Boolean(env.clientId && env.clientSecret),
    },
  }
}

async function getPublicAuthConfig() {
  const [config, userCount] = await Promise.all([
    getAuthConfig(),
    db.$count(schema.users),
  ])
  return {
    allowRegister: config.allowRegister || userCount === 0,
    githubEnabled: isGithubReady(config),
  }
}

async function getGithubProviderConfig() {
  const config = await getAuthConfig()
  if (!isGithubReady(config)) return null
  return resolveGithubCredentials(config.github)
}

async function isRegisterAllowed() {
  return (await getAuthConfig()).allowRegister
}

async function canRegisterNewUser() {
  if ((await db.$count(schema.users)) === 0) return true
  return await isRegisterAllowed()
}

const SiteSettingController = {
  getConfig: getProxyConfig,
  saveConfig: saveProxyConfig,
  getProxyUrl,
  getAuthConfig,
  getSafeAuthConfig,
  saveAuthConfig,
  getPublicAuthConfig,
  getGithubProviderConfig,
  isRegisterAllowed,
  canRegisterNewUser,
}

export default SiteSettingController
