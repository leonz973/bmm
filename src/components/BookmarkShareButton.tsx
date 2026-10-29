'use client'

import { actCreateBookmarkShare } from '@/actions'
import ClientIcon from '@/components/ClientIcon'
import Favicon from '@/components/Favicon'
import ReButton from '@/components/re-export/ReButton'
import ReInput from '@/components/re-export/ReInput'
import type { BookmarkSharePreview } from '@/lib/share-code'
import { runAction } from '@/utils/client'
import { IconNames } from '@cfg'
import {
  addToast,
  Button,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@heroui/react'
import { useSetState } from 'ahooks'

interface Props {
  bookmark: SelectBookmark
}

function formatExpiresAt(expiresAt: Date | null) {
  if (!expiresAt) return ''
  const date = new Date(expiresAt)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** 剪贴板不可用时的降级复制方案 */
function fallbackCopy(text: string) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '0'
  textarea.style.left = '0'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  try {
    textarea.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
  }
}

export default function BookmarkShareButton(props: Props) {
  const [state, setState] = useSetState({
    loading: false,
    isOpen: false,
    code: '',
    expiresAt: null as Date | null,
    preview: null as BookmarkSharePreview | null,
  })

  async function onCreateShare() {
    setState({ loading: true, code: '', expiresAt: null, preview: null })
    await runAction(actCreateBookmarkShare({ id: props.bookmark.id }), {
      onOk: (data) =>
        setState({
          isOpen: true,
          code: data.code,
          expiresAt: data.expiresAt,
          preview: data.bookmark,
        }),
    })
    setState({ loading: false })
  }

  async function onCopy() {
    if (!state.code) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(state.code)
        addToast({ color: 'success', title: '口令已复制' })
        return
      }
    } catch {
      // 无剪贴板权限时走下方的降级逻辑
    }
    if (fallbackCopy(state.code)) {
      addToast({ color: 'success', title: '口令已复制' })
      return
    }
    addToast({ color: 'warning', title: '复制失败', description: '请选中口令后手动复制' })
  }

  const expiresText = formatExpiresAt(state.expiresAt)
  const preview = state.preview

  return (
    <>
      <ReButton
        isIconOnly
        color="primary"
        tooltip={{ content: '分享书签', adaptMobile: true }}
        aria-label={`分享书签 ${props.bookmark.name}`}
        isLoading={state.loading}
        onPress={onCreateShare}
      >
        {state.loading ? null : <span className={IconNames.Tabler.SHARE} />}
      </ReButton>
      <Modal
        isOpen={state.isOpen}
        onOpenChange={(open) => setState({ isOpen: open })}
        size="md"
        backdrop="blur"
        classNames={{ base: 'max-w-[calc(100vw-2rem)] sm:max-w-md' }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">分享书签</ModalHeader>
              <ModalBody>
                <p className="text-default-500 text-sm">
                  将口令发给其他用户，对方可在新建书签时导入。
                </p>

                {preview && (
                  <div className="border-divider/60 bg-content2/40 rounded-xl border p-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <Favicon src={preview.icon} showDefaultIcon />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{preview.name}</p>
                        <p className="text-default-500 mt-0.5 truncate text-xs">{preview.url}</p>
                      </div>
                    </div>
                    {preview.description && (
                      <p className="text-default-500 mt-2 line-clamp-2 text-xs leading-5">
                        {preview.description}
                      </p>
                    )}
                    {preview.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-default-400 text-xs">标签</span>
                        {preview.tags.map((tag) => (
                          <Chip
                            key={tag.name}
                            size="sm"
                            variant="flat"
                            className="dark:bg-content2/36 h-6 bg-slate-200/42 px-2 text-xs"
                            startContent={
                              tag.icon ? (
                                <ClientIcon
                                  icon={tag.icon}
                                  color={tag.color || undefined}
                                  className="size-3.5 text-sm"
                                />
                              ) : null
                            }
                          >
                            {tag.name}
                          </Chip>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <ReInput
                  label="分享口令"
                  isReadOnly
                  value={state.code}
                  classNames={{ input: 'font-mono text-base tracking-[0.18em]' }}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <p className="text-default-500 flex items-center gap-1.5 text-xs">
                  <span className={IconNames.Tabler.SHARE} />
                  <span>7 天内有效{expiresText ? `（至 ${expiresText}）` : ''}</span>
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onClose}>
                  关闭
                </Button>
                <Button
                  color="primary"
                  startContent={<span className={IconNames.Tabler.COPY} />}
                  isDisabled={!state.code}
                  onPress={onCopy}
                >
                  复制口令
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  )
}
