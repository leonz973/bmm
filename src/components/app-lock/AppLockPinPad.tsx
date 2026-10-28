'use client'

import { cn } from '@heroui/react'
import { useEffect } from 'react'

interface Props {
  value: string
  onChange: (value: string) => void
  /** 输满 4 位时触发 */
  onComplete?: (value: string) => void
  disabled?: boolean
  className?: string
}

const PIN_LENGTH = 4
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

const KEY_CLASS = cn(
  'flex h-14 min-h-11 items-center justify-center rounded-xl border border-divider/60 bg-white/45 text-xl font-medium text-foreground',
  'transition-[background-color,border-color,transform] duration-150 hover:bg-white/65 active:scale-[0.98]',
  'disabled:cursor-not-allowed disabled:opacity-45',
  'dark:bg-default-100/5 dark:hover:bg-default-100/10'
)

const ACTION_KEY_CLASS = cn(KEY_CLASS, 'text-default-500 text-sm')

export default function AppLockPinPad(props: Props) {
  const { value, disabled, onChange, onComplete } = props

  function append(digit: string) {
    if (disabled || value.length >= PIN_LENGTH) return
    const next = value + digit
    onChange(next)
    if (next.length === PIN_LENGTH) onComplete?.(next)
  }

  function remove() {
    if (disabled || !value) return
    onChange(value.slice(0, -1))
  }

  function clear() {
    if (disabled) return
    onChange('')
  }

  useEffect(() => {
    if (disabled) return

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return
      }

      if (/^\d$/.test(event.key)) {
        event.preventDefault()
        if (value.length >= PIN_LENGTH) return
        const next = value + event.key
        onChange(next)
        if (next.length === PIN_LENGTH) onComplete?.(next)
        return
      }

      if (event.key === 'Backspace') {
        event.preventDefault()
        if (value) onChange(value.slice(0, -1))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [value, disabled, onChange, onComplete])

  return (
    <div className={cn('mx-auto w-full max-w-[280px]', props.className)}>
      <div className="flex items-center justify-center gap-4" aria-hidden>
        {Array.from({ length: PIN_LENGTH }, (_, index) => (
          <span
            key={index}
            className={cn(
              'size-3.5 rounded-full border transition-[background-color,border-color,transform] duration-150',
              index < value.length
                ? 'border-primary bg-primary scale-110'
                : 'border-divider bg-default-200/50 dark:bg-default-100/20'
            )}
          />
        ))}
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {value.length ? `已输入 ${value.length} 位数字` : '尚未输入数字'}
      </div>

      <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-2.5">
        {DIGITS.map((digit) => (
          <button
            key={digit}
            type="button"
            className={KEY_CLASS}
            disabled={disabled}
            onClick={() => append(digit)}
          >
            {digit}
          </button>
        ))}
        <button
          type="button"
          className={ACTION_KEY_CLASS}
          disabled={disabled || !value}
          onClick={clear}
        >
          清空
        </button>
        <button type="button" className={KEY_CLASS} disabled={disabled} onClick={() => append('0')}>
          0
        </button>
        <button
          type="button"
          className={ACTION_KEY_CLASS}
          disabled={disabled || !value}
          onClick={remove}
        >
          退格
        </button>
      </div>
    </div>
  )
}
