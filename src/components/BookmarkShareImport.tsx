'use client'

import { actResolveBookmarkShare } from '@/actions'
import ReInput from '@/components/re-export/ReInput'
import { runAction } from '@/utils/client'
import { IconNames } from '@cfg'
import { addToast, Button, cn } from '@heroui/react'
import { useSetState } from 'ahooks'

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
  })

  async function onImport() {
    const code = state.code.trim()
    if (!code || state.loading) return
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
        addToast({
          color: 'success',
          title: '已填入分享的书签信息',
          description: data.sourceUserName ? `来自用户「${data.sourceUserName}」的分享` : undefined,
        })
        setState({ code: '' })
      },
    })
    setState({ loading: false })
  }

  return (
    <section className="border-divider/60 bg-content2/40 rounded-2xl border p-4">
      <div className="flex items-start gap-3">
        <span className={cn(IconNames.Tabler.SHARE, 'text-primary mt-0.5 text-lg')} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">导入分享口令</p>
          <p className="text-default-500 mt-0.5 text-xs">
            输入他人分享的口令，自动填入名称、网址、图标、描述和同名标签。
          </p>
          <div className="mt-3 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <ReInput
                size="sm"
                aria-label="分享口令"
                placeholder="粘贴分享口令"
                value={state.code}
                isDisabled={state.loading}
                startContent={
                  <span className={cn(IconNames.Tabler.KEY, 'text-default-400 text-base')} />
                }
                onValueChange={(code) => setState({ code })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    onImport()
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
              onPress={onImport}
            >
              导入
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
