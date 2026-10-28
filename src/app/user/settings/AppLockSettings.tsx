'use client'

import { actDisableAppLock, actSaveAppLock } from '@/actions'
import AppLockPatternPad from '@/components/app-lock/AppLockPatternPad'
import AppLockPinPad from '@/components/app-lock/AppLockPinPad'
import MyModal from '@/components/MyModal'
import type { AppLockMethod, AppLockSettings } from '@/controllers'
import { runAction } from '@/utils/client'
import { IconNames } from '@cfg'
import {
  Button,
  Card,
  CardBody,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Switch,
  cn,
} from '@heroui/react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface Props {
  initial: AppLockSettings
}

type Stage = 'method' | 'input' | 'confirm'

const METHOD_OPTIONS: Array<{
  key: AppLockMethod
  label: string
  note: string
  icon: string
}> = [
  { key: 'pattern', label: '九宫格', note: '至少连接 4 个点', icon: IconNames.Tabler.GRID_DOTS },
  { key: 'pin', label: '数字密码', note: '4 位数字', icon: IconNames.Tabler.KEY },
]

const CARD_CLASS =
  'border-divider/60 dark:bg-content1/62 overflow-hidden rounded-[28px] border bg-white/58 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.18)] backdrop-blur-xl dark:shadow-none'

export default function AppLockSettings(props: Props) {
  const router = useRouter()
  const [settings, setSettings] = useState(props.initial)

  const [setupOpen, setSetupOpen] = useState(false)
  const [stage, setStage] = useState<Stage>('method')
  const [method, setMethod] = useState<AppLockMethod>('pattern')
  const [firstSecret, setFirstSecret] = useState('')
  const [patternValue, setPatternValue] = useState<number[]>([])
  const [pinValue, setPinValue] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [disableOpen, setDisableOpen] = useState(false)
  const [disabling, setDisabling] = useState(false)

  const enabledMethodLabel = settings.method === 'pin' ? '数字密码' : '九宫格'
  const draftMethodLabel = method === 'pin' ? '数字密码' : '九宫格'

  function resetDraft(nextMethod: AppLockMethod) {
    setMethod(nextMethod)
    setFirstSecret('')
    setPatternValue([])
    setPinValue('')
    setError('')
  }

  function openSetup() {
    resetDraft(settings.method || 'pattern')
    setStage('method')
    setSetupOpen(true)
  }

  function closeSetup() {
    if (saving) return
    setSetupOpen(false)
  }

  function handleSwitchChange(selected: boolean) {
    if (saving || disabling) return
    if (selected) openSetup()
    else setDisableOpen(true)
  }

  function handleNextStep() {
    setFirstSecret('')
    setPatternValue([])
    setPinValue('')
    setError('')
    setStage('input')
  }

  function resetToInput() {
    setFirstSecret('')
    setPatternValue([])
    setPinValue('')
    setError('')
    setStage('input')
  }

  async function saveSecret(secret: string) {
    setSaving(true)
    setError('')
    const result = await runAction(actSaveAppLock({ method, secret }), {
      okMsg: settings.enabled ? '解锁方式已更新' : '应用锁已开启',
      onOk(data) {
        setSettings(data)
        setSetupOpen(false)
        router.refresh()
      },
    })
    if (!result.ok) {
      resetToInput()
      setError(result.message)
    }
    setSaving(false)
  }

  function handleDraftComplete(secret: string) {
    if (saving) return

    if (method === 'pattern' && secret.split(',').filter(Boolean).length < 4) {
      setError('请至少连接 4 个不重复的点')
      setPatternValue([])
      return
    }
    if (method === 'pin' && secret.length !== 4) {
      setError('请输入 4 位数字密码')
      setPinValue('')
      return
    }

    if (stage === 'input') {
      setFirstSecret(secret)
      setPatternValue([])
      setPinValue('')
      setError('')
      setStage('confirm')
      return
    }

    if (stage === 'confirm') {
      if (secret !== firstSecret) {
        setError('两次输入不一致，请重新设置')
        setFirstSecret('')
        setPatternValue([])
        setPinValue('')
        setStage('input')
        return
      }
      void saveSecret(secret)
    }
  }

  async function handleDisable() {
    if (disabling) return
    setDisabling(true)
    const result = await runAction(actDisableAppLock(), {
      okMsg: '应用锁已关闭',
      onOk(data) {
        setSettings(data)
        setDisableOpen(false)
        router.refresh()
      },
    })
    setDisabling(false)
    if (!result.ok) return
  }

  return (
    <>
      <Card shadow="none" className={CARD_CLASS}>
        <CardBody className="px-5 py-6 sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="border-divider/70 bg-background/70 dark:bg-default-100/10 flex size-10 shrink-0 items-center justify-center rounded-xl border">
                <span className={cn(IconNames.Tabler.SHIELD_LOCK, 'text-primary text-xl')} />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold">应用锁</h2>
                <p className="text-default-500 mt-1 text-sm leading-6">
                  进入个人空间与后台前需要验证九宫格或数字密码，30 分钟无操作会自动重新上锁。
                </p>
              </div>
            </div>
            <Switch
              aria-label="应用锁"
              className="shrink-0"
              size="sm"
              color="primary"
              isSelected={settings.enabled}
              isDisabled={saving || disabling}
              onValueChange={handleSwitchChange}
            />
          </div>

          <div className="border-divider/60 dark:bg-default-100/5 mt-4 flex items-center gap-2 rounded-xl border bg-white/35 px-3 py-2.5 text-sm">
            <span
              className={cn(
                settings.enabled ? IconNames.Tabler.SHIELD_LOCK : IconNames.Tabler.LOCK,
                'text-base',
                settings.enabled ? 'text-success' : 'text-default-400'
              )}
            />
            <span className={settings.enabled ? 'text-foreground' : 'text-default-500'}>
              {settings.enabled ? `已开启 · ${enabledMethodLabel}解锁` : '未开启，进入空间无需验证'}
            </span>
          </div>

          {settings.enabled && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="flat" onPress={openSetup}>
                修改解锁方式
              </Button>
              <Button size="sm" variant="light" color="danger" onPress={() => setDisableOpen(true)}>
                关闭应用锁
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      <Modal
        isOpen={setupOpen}
        backdrop="blur"
        isDismissable={!saving}
        isKeyboardDismissDisabled={saving}
        onClose={closeSetup}
      >
        <ModalContent>
          <ModalHeader>{settings.enabled ? '修改应用锁' : '设置应用锁'}</ModalHeader>
          <ModalBody>
            {stage === 'method' ? (
              <div>
                <div className="grid grid-cols-2 gap-3">
                  {METHOD_OPTIONS.map((option) => {
                    const selected = method === option.key
                    return (
                      <button
                        key={option.key}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setMethod(option.key)}
                        className={cn(
                          'flex min-h-[112px] flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-[background-color,border-color] duration-150',
                          selected
                            ? 'border-primary/80 bg-primary/10'
                            : 'border-divider/60 bg-default-100/10 hover:border-default-400/40'
                        )}
                      >
                        <span
                          className={cn(
                            option.icon,
                            'text-xl',
                            selected ? 'text-primary' : 'text-default-500'
                          )}
                        />
                        <span className="text-sm font-semibold">{option.label}</span>
                        <span className="text-default-500 text-xs leading-5">{option.note}</span>
                      </button>
                    )
                  })}
                </div>
                <p className="text-default-500 mt-3 text-xs leading-5">
                  九宫格至少连接 4 个不重复的点；数字密码为 4 位数字。设置完成后需再次输入确认。
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-sm font-medium">
                    {stage === 'input' ? `设置${draftMethodLabel}` : '请再次输入以确认'}
                  </p>
                  <p className="text-default-500 mt-1 text-xs leading-5">
                    {method === 'pattern'
                      ? stage === 'input'
                        ? '按住并依次连接至少 4 个点'
                        : '请再次绘制相同的九宫格图案'
                      : stage === 'input'
                        ? '请输入 4 位数字密码'
                        : '请再次输入相同的 4 位数字'}
                  </p>
                </div>

                {method === 'pattern' ? (
                  <AppLockPatternPad
                    value={patternValue}
                    onChange={setPatternValue}
                    onComplete={(points) => handleDraftComplete(points.join(','))}
                    disabled={saving}
                  />
                ) : (
                  <AppLockPinPad
                    value={pinValue}
                    onChange={setPinValue}
                    onComplete={handleDraftComplete}
                    disabled={saving}
                  />
                )}

                <div className="min-h-5 text-center" aria-live="polite">
                  {saving ? (
                    <span className="text-default-500 text-sm">正在保存…</span>
                  ) : error ? (
                    <span role="alert" className="text-danger text-sm">
                      {error}
                    </span>
                  ) : null}
                </div>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            {stage === 'method' ? (
              <>
                <Button variant="light" isDisabled={saving} onPress={closeSetup}>
                  取消
                </Button>
                <Button color="primary" isDisabled={saving} onPress={handleNextStep}>
                  下一步
                </Button>
              </>
            ) : (
              <>
                <Button variant="light" isDisabled={saving} onPress={resetToInput}>
                  重新输入
                </Button>
                <Button variant="light" isDisabled={saving} onPress={closeSetup}>
                  取消
                </Button>
              </>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>

      <MyModal
        isOpen={disableOpen}
        title="关闭应用锁"
        isDismissable={!disabling}
        isKeyboardDismissDisabled={disabling}
        onClose={() => {
          if (!disabling) setDisableOpen(false)
        }}
        onOk={handleDisable}
        okButtonProps={{ color: 'danger', isLoading: disabling }}
      >
        <p className="text-default-500 text-sm leading-6">
          关闭后，进入个人空间与后台将不再需要验证。确定要关闭应用锁吗？
        </p>
      </MyModal>
    </>
  )
}
