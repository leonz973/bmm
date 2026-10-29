'use client'

import { actResolveBookmarkShare } from '@/actions'
import ReInput from '@/components/re-export/ReInput'
import { normalizeBookmarkShareCode } from '@/lib/share-code'
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
  cn,
} from '@heroui/react'
import { useSetState } from 'ahooks'
import { useEffect } from 'react'

export interface BookmarkShareImportData {
  url: string
  name: string
  icon: string
  description: string
  relatedTagIds: TagId[]
  sourceUserName?: string
}

export interface BookmarkShareImportProps {
  tags: SelectTag[]
  onResolved: (data: BookmarkShareImportData) => void
}

export default function BookmarkShareImport(props: BookmarkShareImportProps) {
  const [state, setState] = useSetState({
    code: '',
    loading: false,
    detectedCode: '',
    clipboardOpen: false,
    lastImport: null as null | { name: string; sourceUserName: string; tagNames: string[] },
  })

  async function importByCode(rawCode: string) {
    const code = normalizeBookmarkShareCode(rawCode)
    if (!code) {
      addToast({ color: 'danger', title: '请输入有效的分享口令' })
      return
    }
    if (state.loading) return

    setState({ loading: true })
    await runAction(actResolveBookmarkShare({ code }), {
      onOk: (data) => {
        props.onResolved({
          url: data.url,
          name: data.name,
          icon: data.icon,
          description: data.description,
          relatedTagIds: props.tags
            .filter((tag) => data.tagNames.includes(tag.name))
            .map((tag) => tag.id),
          sourceUserName: data.sourceUserName,
        })
        setState({
          code: '',
          clipboardOpen: false,
          lastImport: {
            name: data.name,
            sourceUserName: data.sourceUserName,
            tagNames: data.tagNames,
          },
        })
        addToast({
          color: 'success',
          title: '已填入分享的书签信息',
          description: data.sourceUserName ? `来自用户「${data.sourceUserName}」的分享` : undefined,
        })
      },
    })
    setState({ loading: false })
  }

  // 进入新建页时尝试读取剪贴板；只读取一次，权限被拒绝时静默忽略
  useEffect(() => {
    let cancelled = false

    async function detectClipboardCode() {
      if (!navigator.clipboard?.readText) return
      try {
        const text = await navigator.clipboard.readText()
        if (cancelled) return
        const code = normalizeBookmarkShareCode(text)
        if (code) {
          setState({ detectedCode: code, clipboardOpen: true })
        }
      } catch {
        // 浏览器未授权剪贴板读取时不打扰用户，仍可手动粘贴
      }
    }

    void detectClipboardCode()
    return () => {
      cancelled = true
    }
  }, [setState])

  function handleCodeChange(value: string) {
    // 用户可能粘贴整段分享文字，自动提取其中符合格式的口令
    const code = normalizeBookmarkShareCode(value)
    setState({ code: code || value })
  }

  const lastImportTags = state.lastImport?.tagNames.join('、')

  return (
    <>
      <section className="border-divider/60 bg-content2/40 rounded-2xl border p-4">
        <div className="flex items-start gap-3">
          <span className={cn(IconNames.Tabler.SHARE, 'text-primary mt-0.5 text-lg')} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">导入分享口令</p>
            <p className="text-default-500 mt-0.5 text-xs">
              粘贴整段分享文字也能自动识别口令，填入名称、网址、图标、描述和同名标签。
            </p>
            <div className="mt-3 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <ReInput
                  size="sm"
                  aria-label="分享口令"
                  placeholder="粘贴分享口令，如 BMM-XXXXXXXX"
                  value={state.code}
                  isDisabled={state.loading}
                  startContent={
                    <span className={cn(IconNames.Tabler.KEY, 'text-default-400 text-base')} />
                  }
                  onValueChange={handleCodeChange}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void importByCode(state.code)
                    }
                  }}
                />
              </div>
              <Button
                color="primary"
                size="sm"
                className="shrink-0"
                isLoading={state.loading}
                isDisabled={state.loading || !state.code.trim()}
                startContent={state.loading ? null : <span className={IconNames.Tabler.DOWNLOAD} />}
                onPress={() => importByCode(state.code)}
              >
                导入
              </Button>
            </div>

            {state.lastImport && (
              <p className="text-default-500 mt-2 text-xs leading-5" role="status">
                已导入「{state.lastImport.name}」
                {state.lastImport.sourceUserName
                  ? ` · 来自 ${state.lastImport.sourceUserName}`
                  : ''}
                {lastImportTags ? ` · 标签：${lastImportTags}` : ''}
              </p>
            )}
          </div>
        </div>
      </section>

      <Modal
        isOpen={state.clipboardOpen}
        onOpenChange={(open) => setState({ clipboardOpen: open })}
        size="sm"
        backdrop="blur"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>检测到分享口令</ModalHeader>
              <ModalBody>
                <p className="text-default-500 text-sm leading-6">
                  剪贴板中发现书签分享口令，是否立即导入并填入表单？
                </p>
                <p className="border-divider/60 bg-content2/40 rounded-xl border px-3 py-2 font-mono text-sm tracking-[0.18em]">
                  {state.detectedCode}
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onClose}>
                  暂不导入
                </Button>
                <Button
                  color="primary"
                  isLoading={state.loading}
                  onPress={() => importByCode(state.detectedCode)}
                >
                  立即导入
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  )
}
