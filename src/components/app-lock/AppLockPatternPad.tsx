'use client'

import { cn } from '@heroui/react'
import { PointerEvent as ReactPointerEvent, useEffect, useRef } from 'react'

interface Props {
  value: number[]
  onChange: (value: number[]) => void
  /** 一次绘制结束（抬起指针）时触发，包含本次绘制经过的所有点 */
  onComplete?: (value: number[]) => void
  disabled?: boolean
  className?: string
}

const POINTS = Array.from({ length: 9 }, (_, index) => index)

function getPointCenter(rect: DOMRect, index: number) {
  const column = index % 3
  const row = Math.floor(index / 3)
  return {
    x: rect.left + (rect.width * (column * 2 + 1)) / 6,
    y: rect.top + (rect.height * (row * 2 + 1)) / 6,
  }
}

function toSvgPoint(index: number) {
  return `${50 + (index % 3) * 100},${50 + Math.floor(index / 3) * 100}`
}

export default function AppLockPatternPad(props: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const drawingRef = useRef(false)
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null)
  const valueRef = useRef<number[]>(props.value)

  useEffect(() => {
    valueRef.current = props.value
  }, [props.value])

  function getThreshold(rect: DOMRect) {
    return Math.min(rect.width, rect.height) / 9
  }

  function findPoint(clientX: number, clientY: number) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return -1
    const threshold = getThreshold(rect)
    for (const index of POINTS) {
      const center = getPointCenter(rect, index)
      if (Math.hypot(clientX - center.x, clientY - center.y) <= threshold) return index
    }
    return -1
  }

  /** 快速滑动时 pointermove 可能直接跳过某个点，按线段距离补全中间经过的点 */
  function findPointsOnSegment(from: { x: number; y: number }, to: { x: number; y: number }) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return []
    const threshold = getThreshold(rect)
    const dx = to.x - from.x
    const dy = to.y - from.y
    const lengthSq = dx * dx + dy * dy
    if (lengthSq === 0) {
      const index = findPoint(to.x, to.y)
      return index >= 0 && !valueRef.current.includes(index) ? [index] : []
    }

    const matched: Array<{ index: number; progress: number }> = []
    for (const index of POINTS) {
      if (valueRef.current.includes(index)) continue
      const center = getPointCenter(rect, index)
      const progress = Math.max(
        0,
        Math.min(1, ((center.x - from.x) * dx + (center.y - from.y) * dy) / lengthSq)
      )
      const nearestX = from.x + dx * progress
      const nearestY = from.y + dy * progress
      if (Math.hypot(center.x - nearestX, center.y - nearestY) <= threshold) {
        matched.push({ index, progress })
      }
    }
    return matched.sort((a, b) => a.progress - b.progress).map((item) => item.index)
  }

  function update(next: number[]) {
    valueRef.current = next
    props.onChange(next)
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (props.disabled) return
    const index = findPoint(event.clientX, event.clientY)
    if (index < 0) return
    event.preventDefault()
    drawingRef.current = true
    lastPointerRef.current = { x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
    update([index])
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drawingRef.current || props.disabled) return
    const current = { x: event.clientX, y: event.clientY }
    const from = lastPointerRef.current || current
    lastPointerRef.current = current
    const nextPoints = findPointsOnSegment(from, current)
    if (!nextPoints.length) return
    update([...valueRef.current, ...nextPoints])
  }

  function handlePointerEnd() {
    if (!drawingRef.current) return
    drawingRef.current = false
    lastPointerRef.current = null
    props.onComplete?.([...valueRef.current])
  }

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label="九宫格解锁图案"
      className={cn(
        'relative mx-auto aspect-square w-full max-w-[280px] touch-none select-none',
        props.disabled && 'cursor-not-allowed opacity-60',
        props.className
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onContextMenu={(event) => event.preventDefault()}
    >
      <svg
        aria-hidden
        viewBox="0 0 300 300"
        className="text-primary pointer-events-none absolute inset-0 h-full w-full"
      >
        {props.value.length > 1 && (
          <polyline
            points={props.value.map(toSvgPoint).join(' ')}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={4}
            opacity={0.85}
          />
        )}
      </svg>

      <div className="grid h-full w-full grid-cols-3 grid-rows-3">
        {POINTS.map((index) => {
          const selected = props.value.includes(index)
          return (
            <div key={index} className="flex items-center justify-center">
              <span
                className={cn(
                  'flex size-11 items-center justify-center rounded-full border transition-[background-color,border-color,transform] duration-150 sm:size-12',
                  selected
                    ? 'border-primary bg-primary/12 scale-105'
                    : 'border-default-400/55 dark:border-divider/70 dark:bg-default-100/5 bg-white/55'
                )}
              >
                <span
                  className={cn(
                    'size-2.5 rounded-full transition-colors duration-150',
                    selected ? 'bg-primary' : 'bg-default-400/80 dark:bg-default-300/70'
                  )}
                />
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
