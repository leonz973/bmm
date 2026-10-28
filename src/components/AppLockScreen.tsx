'use client'

import { actResetAppLockWithPassword, actVerifyAppLock } from '@/actions'
import AppLockPatternPad from '@/components/app-lock/AppLockPatternPad'
import AppLockPinPad from '@/components/app-lock/AppLockPinPad'
import MyModal from '@/components/MyModal'
import ReInput from '@/components/re-export/ReInput'
import type { AppLockMethod } from '@/controllers'
import { runAction } from '@/utils/client'
import { IconNames, PageRoutes } from '@cfg'
import { Avatar, Button, Card, CardBody, cn } from '@heroui/react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useState } from 'react'

interface Props {
  user: {
    name: string
    email: string
    image?: string | null
  }
  method: AppLockMethod
}

export default function AppLockScreen(props: Props) {
  const router = useRouter()
  const isPattern = props.method === 'pattern'

  const [pattern, setPattern] = useState<number[]>([])
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [verifying, setVerifying] = useState(false)

  const [forgotOpen, setForgotOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetting, setResetting] = useState(false)

  async function verify(secret: string) {
    if (verifying) return
    setVerifying(true)
    setError('')

    const result = await runAction(actVerifyAppLock({ secret }), {
      errToast: { hidden: true },
      onOk() {
        router.refresh()
      },
    })

    if (!result.ok) {
      setError(result.message)
      setVerifying(false)
      if (isPattern) setPattern([])
      else setPin('')
    }
  }

  function handlePatternChange(value: number[]) {
    setPattern(value)
    if (error) setError('')
  }

  function handlePatternComplete(value: number[]) {
    if (value.length < 4) {
      setError('请至少连接 4 个不重复的点')
      setPattern([])
      return
    }
    void verify(value.join(','))
  }

  function handlePinChange(value: string) {
    setPin(value)
    if (error) setError('')
  }

  function handlePinComplete(value: string) {
    if (value.length !== 4) {
      setError('请输入 4 位数字密码')
      setPin('')
      return
    }
    void verify(value)
  }

  function openForgotModal() {
    setPassword('')
    setResetError('')
    setForgotOpen(true)
  }

  async function handleReset() {
    if (resetting) return
    if (!password) {
      setResetError('请输入账号密码')
      return
    }

    setResetting(true)
    setResetError('')
    const result = await runAction(actResetAppLockWithPassword({ password }), {
      okMsg: '应用锁已关闭',
      errToast: { hidden: true },
      onOk() {
        setForgotOpen(false)
        router.refresh()
      },
    })
    if (!result.ok) setResetError(result.message)
    setResetting(false)
  }

  function handleSignOut() {
    void signOut({ redirectTo: PageRoutes.LOGIN })
  }

  return (
    <div className="flex min-h-svh items-center justify-center px-4 py-10">
      <Card
        shadow="none"
        className="border-divider/60 dark:bg-content1/62 w-full max-w-[440px] overflow-hidden rounded-[28px] border bg-white/58 shadow-[0_24px_60px_-32px_rgba(15,23,42,0.28)] backdrop-blur-xl dark:shadow-none"
      >
        <CardBody className="px-5 py-7 sm:px-8 sm:py-9">
          <div className="flex flex-col items-center text-center">
            <div className="border-divider/70 bg-background/70 dark:bg-default-100/10 flex size-11 items-center justify-center rounded-2xl border">
              <span className={cn(IconNames.Tabler.SHIELD_LOCK, 'text-primary text-xl')} />
            </div>
            <Avatar
              className="mt-4 size-16 text-xl shadow-sm"
              src={props.user.image || undefined}
              name={props.user.name || props.user.email}
              showFallback
            />
            <h1 className="mt-3 text-xl font-semibold tracking-tight">应用已锁定</h1>
            <p className="text-default-500 mt-1 max-w-full text-sm break-all">
              {props.user.name || props.user.email}
            </p>
            <p className="text-default-500 mt-3 text-sm leading-6">
              {isPattern ? '请绘制九宫格图案解锁' : '请输入 4 位数字密码解锁'}
            </p>
          </div>

          <div className="mt-6">
            {isPattern ? (
              <AppLockPatternPad
                value={pattern}
                onChange={handlePatternChange}
                onComplete={handlePatternComplete}
                disabled={verifying}
              />
            ) : (
              <AppLockPinPad
                value={pin}
                onChange={handlePinChange}
                onComplete={handlePinComplete}
                disabled={verifying}
              />
            )}
          </div>

          <div
            className="mt-4 flex min-h-5 items-center justify-center text-center"
            aria-live="polite"
          >
            {verifying ? (
              <span className="text-default-500 text-sm">正在验证…</span>
            ) : error ? (
              <span role="alert" className="text-danger text-sm">
                {error}
              </span>
            ) : null}
          </div>

          <div className="border-divider/60 mt-5 flex items-center justify-between gap-2 border-t pt-4">
            <Button size="sm" variant="light" onPress={openForgotModal}>
              忘记解锁密码？
            </Button>
            <Button size="sm" variant="light" color="danger" onPress={handleSignOut}>
              退出登录
            </Button>
          </div>
        </CardBody>
      </Card>

      <MyModal
        isOpen={forgotOpen}
        title="忘记解锁密码"
        isDismissable={!resetting}
        isKeyboardDismissDisabled={resetting}
        onClose={() => {
          if (!resetting) setForgotOpen(false)
        }}
        onOk={handleReset}
        okButtonProps={{ color: 'primary', isLoading: resetting }}
      >
        <div className="w-full space-y-3">
          <p className="text-default-500 text-sm leading-6">
            请输入账号{' '}
            <span className="text-foreground font-medium break-all">{props.user.email}</span>{' '}
            的登录密码，验证通过后将关闭应用锁。
          </p>
          <ReInput
            label="账号密码"
            type="password"
            autoComplete="current-password"
            value={password}
            isDisabled={resetting}
            onValueChange={(value) => {
              setPassword(value)
              if (resetError) setResetError('')
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void handleReset()
              }
            }}
          />
          {resetError && (
            <p role="alert" className="text-danger text-sm">
              {resetError}
            </p>
          )}
        </div>
      </MyModal>
    </div>
  )
}
