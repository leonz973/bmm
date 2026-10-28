'use client'

import { actCreateBookmarkShare } from '@/actions'
import ReButton from '@/components/re-export/ReButton'
import ReTextarea from '@/components/re-export/ReTextarea'
import { runAction } from '@/utils/client'
import { IconNames } from '@cfg'
import {
  addToast,
  Button,
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
  })

  async function onCreateShare() {
    setState({ loading: true, code: '', expiresAt: null })
    await runAction(actCreateBookmarkShare({ id: props.bookmark.id }), {
      onOk: (data) => setState({ isOpen: true, code: data.code, expiresAt: data.expiresAt }),
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

  function onModalOpenChange(open: boolean) {
    setState({ isOpen: open })
  }

  const expiresText = formatExpiresAt(state.expiresAt)

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
        onOpenChange={onModalOpenChange}
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
                <ReTextarea
                  isReadOnly
                  label="分享口令"
                  labelPlacement="outside"
                  value={state.code}
                  classNames={{ input: 'font-mono text-sm', inputWrapper: 'bg-content2' }}
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
