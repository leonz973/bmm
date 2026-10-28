import Favicon from '@/components/Favicon'
import { useUserPreferences } from '@/components/UserPreferenceProvider'
import { useIsMobile } from '@/hooks'
import { useOnClickTag } from '@/hooks/useOnClickTag'
import { getTagLinkAttrs } from '@/utils'
import { Chip, cn, Tooltip } from '@heroui/react'
import { useHomePageContext } from '../ctx'

interface Props extends SelectBookmark {
  editable?: boolean
  allTags?: SelectTag[]
  onRemove?: () => void
  onEdit?: () => void
}

export default function BookmarkCard(props: Props) {
  const { tags } = useHomePageContext()
  const { mobileBookmarkLayout } = useUserPreferences()
  const { onClickTag } = useOnClickTag({ tags })
  const isMobile = useIsMobile()
  const isCompact = mobileBookmarkLayout !== 'list'
  const isThreeColumns = mobileBookmarkLayout === 'three-columns'

  const generateLinkTitle = () => {
    const baseTitle = `${props.name} - ${props.description}`
    // 加入标签信息增强相关性
    const tagNames = props.relatedTagIds
      .map((id) => tags.find((tag) => tag.id === id)?.name)
      .filter(Boolean)
    return tagNames.length ? `${baseTitle} (标签: ${tagNames.join(', ')})` : baseTitle
  }

  return (
    <div
      className={cn(
        'max-xs:pb-3 max-xs:dark:border-white/8 max-xs:dark:bg-content1/22 xs:hover:-translate-y-0.5 xs:hover:border-slate-200/70 xs:hover:bg-white/26 dark:xs:hover:border-white/12 dark:xs:hover:bg-content1/34 dark:bg-content1/28 flex min-h-40 cursor-pointer flex-col gap-2 rounded-3xl border border-slate-200/65 bg-white/16 p-4 backdrop-blur-md transition-[background-color,border-color,transform] duration-150 dark:border-white/10',
        isCompact &&
          'max-xs:min-h-[136px] max-xs:items-center max-xs:justify-center max-xs:rounded-[20px] max-xs:p-3',
        isThreeColumns && 'max-xs:min-h-[118px] max-xs:rounded-[18px] max-xs:px-2.5'
      )}
      onClick={() => window.open(props.url, '_blank')}
    >
      <a
        className={cn(
          'flex min-w-0 items-start gap-2',
          isCompact && 'max-xs:w-full max-xs:flex-col max-xs:items-center max-xs:gap-3'
        )}
        href={props.url}
        target="_blank"
        rel="noopener noreferrer"
        title={generateLinkTitle()}
        onClick={(event) => event.stopPropagation()}
      >
        <Favicon
          src={props.icon}
          showDefaultIcon
          alt={`${props.name}网站图标`}
          className={cn(
            isCompact && 'max-xs:size-11! max-xs:rounded-[13px] max-xs:p-1.5',
            isThreeColumns && 'max-xs:size-[42px]! max-xs:rounded-xl'
          )}
        />
        <div className="max-xs:w-full min-w-0 grow">
          <h3
            className={cn(
              'text-foreground-700 xs:text-lg',
              !isCompact && 'truncate',
              isCompact &&
                'max-xs:w-full max-xs:text-center max-xs:text-sm max-xs:leading-5 max-xs:font-medium',
              isCompact &&
                (isThreeColumns ? 'max-xs:truncate' : 'max-xs:line-clamp-2 max-xs:break-words')
            )}
            aria-label={`访问${props.name}`}
          >
            {props.name}
          </h3>
          {props.sourceUserName && (
            <p
              className={cn(
                'text-default-400 mt-0.5 truncate text-[11px] leading-4',
                isCompact && 'max-xs:hidden'
              )}
            >
              来源：{props.sourceUserName}
            </p>
          )}
        </div>
      </a>
      <div className={cn('min-h-10', isCompact && 'max-xs:hidden')}>
        {(() => {
          const desc = props.description
          if (!desc) {
            return <p className="text-default-400 text-xs leading-5.5">打开站点查看详情与内容。</p>
          }
          const node = (
            <p
              className="text-foreground-500 line-clamp-3 text-xs leading-5.5 break-all"
              role="description"
            >
              {desc}
            </p>
          )
          if (isMobile) return node
          return (
            <p
              className="text-foreground-500 line-clamp-3 text-xs leading-5.5 break-all"
              role="description"
            >
              <Tooltip
                delay={500}
                content={
                  <span className="break-all">
                    {props.name}：{desc}
                  </span>
                }
                className="max-w-80"
              >
                <span>{desc}</span>
              </Tooltip>
            </p>
          )
        })()}
      </div>
      <div
        className={cn(
          'scrollbar-hide flex max-w-full grow items-end gap-1.5 overflow-auto pt-0.5',
          isCompact && 'max-xs:hidden'
        )}
        aria-label="相关标签"
      >
        {props.relatedTagIds.map((id) => {
          const tag = tags.find((tag) => tag.id === id)
          if (!tag) return null
          return (
            <Chip
              key={tag.id}
              variant="flat"
              as="a"
              {...getTagLinkAttrs(tag)}
              onClick={(event) => onClickTag({ tag, event: event as any })}
              className="text-foreground-500 xs:hover:text-foreground-700 dark:bg-content2/36 h-6 cursor-pointer border-none bg-slate-200/42 px-2 text-xs transition active:opacity-50"
            >
              {tag.name}
            </Chip>
          )
        })}
      </div>
    </div>
  )
}
