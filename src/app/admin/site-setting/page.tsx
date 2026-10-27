'use client'

import {
  actGetSiteAuthConfig,
  actGetSiteProxyConfig,
  actSaveSiteAuthConfig,
  actSaveSiteProxyConfig,
} from '@/actions'
import { AdminSurfaceCard } from '@/components/AdminPageShell'
import AdminPageTitle from '@/components/AdminPageTitle'
import ReButton from '@/components/re-export/ReButton'
import ReInput from '@/components/re-export/ReInput'
import { runAction } from '@/utils/client'
import { IconNames, PageRoutes } from '@cfg'
import { addToast, Switch } from '@heroui/react'
import { useRequest } from 'ahooks'
import { useState } from 'react'

export default function Page() {
  const [proxyUrl, setProxyUrl] = useState('')
  const [savingProxy, setSavingProxy] = useState(false)
  const [savingAuth, setSavingAuth] = useState(false)
  const [authConfig, setAuthConfig] = useState({
    allowRegister: false,
    githubEnabled: false,
    githubClientId: '',
    githubClientSecret: '',
    hasGithubSecret: false,
    envGithubConfigured: false,
  })

  const { loading } = useRequest(async () => {
    const [proxyRes, authRes] = await Promise.all([
      runAction(actGetSiteProxyConfig()),
      runAction(actGetSiteAuthConfig()),
    ])
    if (proxyRes.ok) {
      setProxyUrl(proxyRes.data.proxyUrl)
    }
    if (authRes.ok) {
      setAuthConfig({
        allowRegister: authRes.data.allowRegister,
        githubEnabled: authRes.data.github.enabled,
        githubClientId: authRes.data.github.clientId,
        githubClientSecret: '',
        hasGithubSecret: authRes.data.github.hasClientSecret,
        envGithubConfigured: authRes.data.github.envConfigured,
      })
    }
  })

  async function saveProxy() {
    const trimmed = proxyUrl.trim()
    if (trimmed && !trimmed.includes('{url}')) {
      addToast({
        color: 'warning',
        title: '格式错误',
        description: '代理地址必须包含 {url} 占位符',
      })
      return
    }
    setSavingProxy(true)
    try {
      await runAction(actSaveSiteProxyConfig({ proxyUrl: trimmed }), {
        okMsg: '配置已保存',
      })
    } finally {
      setSavingProxy(false)
    }
  }

  async function saveAuth() {
    setSavingAuth(true)
    try {
      const res = await runAction(
        actSaveSiteAuthConfig({
          allowRegister: authConfig.allowRegister,
          github: {
            enabled: authConfig.githubEnabled,
            clientId: authConfig.githubClientId,
            clientSecret: authConfig.githubClientSecret,
          },
        }),
        { okMsg: '登录设置已保存' }
      )
      if (res.ok) {
        setAuthConfig((value) => ({
          ...value,
          githubClientId: res.data.github.clientId,
          githubClientSecret: '',
          hasGithubSecret: res.data.github.hasClientSecret,
          envGithubConfigured: res.data.github.envConfigured,
        }))
      }
    } finally {
      setSavingAuth(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <AdminPageTitle title="网站设置" pathname={PageRoutes.Admin.SITE_SETTING} />

      <AdminSurfaceCard bodyClassName="p-5 sm:p-6">
        <div>
          <h3 className="text-lg font-semibold">网络代理</h3>
          <p className="text-default-500 mt-1 text-sm">
            配置后，获取网页内容和检测站点可用性时将通过代理访问。
          </p>
        </div>
        <br />
        <ReInput
          label="代理地址"
          placeholder="https://example.com/proxy?url={url}"
          description="使用 {url} 作为目标地址的占位符，例如 https://example.com/proxy?url={url}"
          isClearable
          value={proxyUrl}
          onValueChange={setProxyUrl}
        />

        <div className="mt-4 flex items-center gap-3">
          <ReButton
            color="primary"
            isLoading={loading || savingProxy}
            startContent={<span className={IconNames.Tabler.CHECK} />}
            onClick={saveProxy}
          >
            保存
          </ReButton>
        </div>
      </AdminSurfaceCard>

      <AdminSurfaceCard bodyClassName="p-5 sm:p-6">
        <div>
          <h3 className="text-lg font-semibold">登录与注册</h3>
          <p className="text-default-500 mt-1 text-sm">
            控制新用户注册与第三方授权登录。修改后立即生效。
          </p>
        </div>

        <div className="border-divider/70 bg-content2/45 mt-5 flex items-start justify-between gap-4 rounded-xl border p-4">
          <div className="min-w-0 flex-1">
            <p className="font-medium">允许新用户注册</p>
            <p className="text-default-500 mt-1 text-sm leading-6">
              关闭后，登录页会隐藏注册入口，服务端也会拒绝创建新账号。首个管理员账号始终可以注册。
            </p>
          </div>
          <Switch
            aria-label="允许新用户注册"
            className="shrink-0"
            size="sm"
            color="primary"
            isDisabled={loading}
            isSelected={authConfig.allowRegister}
            onValueChange={(allowRegister) =>
              setAuthConfig((value) => ({ ...value, allowRegister }))
            }
          />
        </div>

        <div className="border-divider mt-6 border-t pt-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h4 className="text-base font-semibold">第三方授权登录</h4>
              <p className="text-default-500 mt-1 text-sm leading-6">
                当前支持 GitHub。启用并填写 OAuth App 凭据后，登录页会显示 GitHub 授权登录入口。
              </p>
            </div>
            <Switch
              aria-label="启用 GitHub 登录"
              className="shrink-0"
              size="sm"
              color="primary"
              isDisabled={loading}
              isSelected={authConfig.githubEnabled}
              onValueChange={(githubEnabled) =>
                setAuthConfig((value) => ({ ...value, githubEnabled }))
              }
            />
          </div>

          <div className="mt-4 grid gap-4">
            <ReInput
              label="Client ID"
              placeholder="GitHub OAuth App 的 Client ID"
              isClearable
              value={authConfig.githubClientId}
              onValueChange={(githubClientId) =>
                setAuthConfig((value) => ({ ...value, githubClientId }))
              }
            />
            <ReInput
              label="Client Secret"
              type="password"
              placeholder={authConfig.hasGithubSecret ? '已配置，留空则不修改' : '请输入 Client Secret'}
              description={
                authConfig.hasGithubSecret
                  ? '已保存密钥；留空保存时保持原值。'
                  : '仅保存在服务端，不会回传到浏览器。'
              }
              value={authConfig.githubClientSecret}
              onValueChange={(githubClientSecret) =>
                setAuthConfig((value) => ({ ...value, githubClientSecret }))
              }
            />
            <p className="text-default-500 text-xs leading-5">
              在 GitHub OAuth App 的 Authorization callback URL 中填写：
              <code className="bg-content2 mx-1 rounded px-1.5 py-0.5">
                /api/auth/callback/github
              </code>
              （前面加上站点域名）。
            </p>
            {authConfig.envGithubConfigured && (
              <p className="text-default-500 text-xs leading-5">
                已检测到环境变量 AUTH_GITHUB_ID / AUTH_GITHUB_SECRET；Client ID 与 Client Secret
                都留空时，会使用环境变量。
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <ReButton
            color="primary"
            isLoading={loading || savingAuth}
            startContent={<span className={IconNames.Tabler.CHECK} />}
            onClick={saveAuth}
          >
            保存
          </ReButton>
        </div>
      </AdminSurfaceCard>
    </div>
  )
}
