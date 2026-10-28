'use client'

import { useUserPreferences } from '@/components/UserPreferenceProvider'
import type { MobileBookmarkLayout } from '@/controllers'
import { IconNames } from '@cfg'
import { Card, CardBody, cn } from '@heroui/react'
import { useState } from 'react'

const LAYOUT_OPTIONS: Array<{
  key: MobileBookmarkLayout
  label: string
  note: string
  columns: number
}> = [
  { key: 'list', label: '列表', note: '默认 · 原样式', columns: 1 },
  { key: 'two-columns', label: '双列', note: '清晰易读', columns: 2 },
  { key: 'three-columns', label: '三列', note: '紧凑高效', columns: 3 },
]

function LayoutPreview({ columns }: { columns: number }) {
  const count = columns === 1 ? 3 : columns === 2 ? 4 : 6
  return (
    <div
      aria-hidden
      className={cn(
        'border-divider/50 dark:bg-default-100/5 grid h-12 w-[62px] gap-1 rounded-lg border bg-white/35 p-1.5',
        columns === 1 && 'grid-rows-3',
        columns === 2 && 'grid-cols-2',
        columns === 3 && 'grid-cols-3'
      )}
    >
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="rounded-[4px] border border-white/8 bg-slate-300/30" />
      ))}
    </div>
  )
}

type SaveFeedback = 'idle' | 'saved' | 'error'

export default function BookmarkLayoutSettings() {
  const { mobileBookmarkLayout, updateMobileBookmarkLayout } = useUserPreferences()
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<SaveFeedback>('idle')

  async function handleSelect(layout: MobileBookmarkLayout) {
    if (saving || layout === mobileBookmarkLayout) return
    setSaving(true)
    setFeedback('idle')
    const ok = await updateMobileBookmarkLayout(layout)
    setSaving(false)
    setFeedback(ok ? 'saved' : 'error')
  }

  const statusText = saving
    ? '正在保存…'
    : feedback === 'saved'
      ? '已保存，仅影响移动端布局'
      : feedback === 'error'
        ? '保存失败，请重试'
        : '选择后自动保存，仅影响移动端布局'

  return (
    <Card
      shadow="none"
      className="border-divider/60 dark:bg-content1/62 overflow-hidden rounded-[28px] border bg-white/58 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.18)] backdrop-blur-xl dark:shadow-none"
    >
      <CardBody className="px-5 py-6 sm:px-7">
        <div className="flex items-start gap-3">
          <div className="border-divider/70 bg-background/70 dark:bg-default-100/10 flex size-10 shrink-0 items-center justify-center rounded-xl border">
            <span className={cn(IconNames.Tabler.DASHBOARD, 'text-primary text-xl')} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold">书签显示</h2>
            <p className="text-default-500 mt-1 text-sm leading-6">
              默认保留原列表，可切换为紧凑卡片。仅影响移动端，桌面布局保持不变。
            </p>
          </div>
        </div>

        <fieldset className="mt-5" disabled={saving}>
          <legend className="sr-only">移动端书签布局</legend>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {LAYOUT_OPTIONS.map((option) => {
              const selected = option.key === mobileBookmarkLayout
              return (
                <label key={option.key} className="relative min-w-0 cursor-pointer">
                  <input
                    type="radio"
                    name="mobile-bookmark-layout"
                    value={option.key}
                    checked={selected}
                    onChange={() => handleSelect(option.key)}
                    className="peer sr-only"
                  />
                  <div
                    className={cn(
                      'flex min-h-[132px] flex-col items-center rounded-[17px] border px-1.5 py-3 text-center transition-[background-color,border-color,box-shadow] duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-sky-400/60 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-transparent',
                      selected
                        ? 'border-primary/80 bg-primary/10 shadow-[0_0_0_1px_rgba(96,165,250,0.1)]'
                        : 'border-divider/60 bg-default-100/10 hover:border-default-400/40'
                    )}
                  >
                    <LayoutPreview columns={option.columns} />
                    <span className="mt-2.5 text-sm font-semibold">{option.label}</span>
                    <span
                      className={cn(
                        'mt-0.5 text-xs leading-5',
                        selected ? 'text-primary-500' : 'text-default-500'
                      )}
                    >
                      {option.note}
                    </span>
                  </div>
                  {selected && (
                    <span
                      className={cn(
                        IconNames.Tabler.CIRCLE_CHECK,
                        'text-primary absolute top-2 right-2 text-base'
                      )}
                    />
                  )}
                </label>
              )
            })}
          </div>
        </fieldset>

        <div
          className={cn(
            'mt-4 flex items-center justify-center gap-1.5 text-xs leading-5',
            feedback === 'error' ? 'text-danger' : 'text-default-500'
          )}
          aria-live="polite"
        >
          <span
            className={cn(
              saving
                ? cn(IconNames.Tabler.LOADER_2, 'animate-spin')
                : feedback === 'error'
                  ? IconNames.Tabler.ALERT_CIRCLE
                  : IconNames.Tabler.CIRCLE_CHECK,
              'text-sm',
              feedback === 'saved' && !saving && 'text-success'
            )}
          />
          {statusText}
        </div>
      </CardBody>
    </Card>
  )
}
