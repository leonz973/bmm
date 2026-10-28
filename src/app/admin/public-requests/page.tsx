'use client'

import { actFindBookmarkPublishRequests, actReviewBookmarkPublish } from '@/actions'
import { AdminSurfaceCard } from '@/components/AdminPageShell'
import AdminPageTitle from '@/components/AdminPageTitle'
import EmptyListPlaceholder from '@/components/EmptyListPlaceholder'
import Favicon from '@/components/Favicon'
import MyModal from '@/components/MyModal'
import ReButton from '@/components/re-export/ReButton'
import { runAction } from '@/utils/client'
import { IconNames, PageRoutes } from '@cfg'
import {
  Chip,
  Link,
  Pagination,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@heroui/react'
import { useRequest } from 'ahooks'
import { useState } from 'react'

type PublishStatus = 'pending' | 'unpublishing' | 'public' | 'rejected'

interface PublishRequestItem {
  id: number
  name: string
  url: string
  icon?: string | null
  description?: string | null
  publishStatus: PublishStatus
  publishRequestedAt?: string | Date | null
  publishRejectReason?: string | null
  relatedTagIds: number[]
  relatedTagNames: string[]
  userName: string
  userEmail: string
}

const STATUS_OPTIONS: { key: PublishStatus; label: string; color: 'warning' | 'success' | 'danger' }[] = [
  { key: 'pending', label: '待公开', color: 'warning' },
  { key: 'unpublishing', label: '待取消', color: 'warning' },
  { key: 'public', label: '已公开', color: 'success' },
  { key: 'rejected', label: '已拒绝', color: 'danger' },
]

const PAGE_SIZE = 20

export default function Page() {
  const [status, setStatus] = useState<PublishStatus>('pending')
  const [page, setPage] = useState(1)
  const [reviewingId, setReviewingId] = useState<number | null>(null)

  const {
    data,
    loading,
    refresh,
  } = useRequest(
    async () => {
      const res = await runAction(
        actFindBookmarkPublishRequests({ status, page, limit: PAGE_SIZE })
      )
      if (!res.ok) return { list: [] as PublishRequestItem[], total: 0 }
      return res.data as { list: PublishRequestItem[]; total: number }
    },
    { refreshDeps: [status, page] }
  )

  const list = data?.list || []
  const total = data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  async function review(item: PublishRequestItem, approve: boolean) {
    const isUnpublish = item.publishStatus === 'unpublishing'
    setReviewingId(item.id)
    try {
      await runAction(
        actReviewBookmarkPublish({
          id: item.id,
          approve,
          rejectReason: approve
            ? undefined
            : isUnpublish
              ? '管理员拒绝了取消公开申请'
              : '管理员拒绝了公开申请',
        }),
        {
          okMsg: isUnpublish
            ? approve
              ? '已通过取消公开申请'
              : '已拒绝取消公开申请'
            : approve
              ? '已通过公开申请'
              : '已拒绝公开申请',
          onOk: refresh,
        }
      )
    } finally {
      setReviewingId(null)
    }
  }

  function confirmReview(item: PublishRequestItem, approve: boolean) {
    const isUnpublish = item.publishStatus === 'unpublishing'
    const action = isUnpublish ? '取消公开' : '公开'
    MyModal.open({
      title: `${approve ? '通过' : '拒绝'}${action}申请`,
      children: (
        <p>
          确定{approve ? '通过' : '拒绝'}「{item.name}」的{action}申请？
          {approve &&
            (isUnpublish
              ? ' 通过后将立即从公共首页移除。'
              : ' 通过后将立即在公共首页展示。')}
        </p>
      ),
      okButtonProps: approve ? { color: 'primary' } : { color: 'danger' },
      onOk: () => review(item, approve),
    })
  }

  function formatDate(value?: string | Date | null) {
    if (!value) return '-'
    return new Date(value).toLocaleString('zh-CN', { hour12: false })
  }

  return (
    <div className="flex flex-col gap-4">
      <AdminPageTitle
        title="公开审核"
        pathname={PageRoutes.Admin.PUBLIC_REQUESTS}
        icon={IconNames.Tabler.UPLOAD}
      />
      <AdminSurfaceCard
        title="个人书签公开申请"
        description="普通用户提交公开或取消公开申请后在此审核；管理员在自己的书签列表切换开关时立即生效。"
        extra={
          <div className="flex items-center gap-2">
            {STATUS_OPTIONS.map((option) => (
              <ReButton
                key={option.key}
                size="sm"
                variant={status === option.key ? 'solid' : 'flat'}
                color={option.color}
                onPress={() => {
                  setStatus(option.key)
                  setPage(1)
                }}
              >
                {option.label}
              </ReButton>
            ))}
          </div>
        }
      >
        <Table
          aria-label="公开申请列表"
          removeWrapper
          bottomContent={
            totalPages > 1 ? (
              <div className="flex w-full justify-center">
                <Pagination page={page} total={totalPages} onChange={setPage} />
              </div>
            ) : null
          }
        >
          <TableHeader>
            <TableColumn className="w-40">用户</TableColumn>
            <TableColumn>书签</TableColumn>
            <TableColumn className="w-40">标签</TableColumn>
            <TableColumn className="w-40">申请时间</TableColumn>
            <TableColumn className="w-24">状态</TableColumn>
            <TableColumn className="w-32">操作</TableColumn>
          </TableHeader>
          <TableBody<PublishRequestItem>
            items={loading ? [] : list}
            isLoading={loading}
            loadingContent={<Spinner className="mt-12" label="加载中..." />}
            emptyContent={<EmptyListPlaceholder target="bookmark" />}
          >
            {(item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{item.userName}</span>
                    <span className="text-default-500 truncate text-xs">{item.userEmail}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex min-w-0 items-center gap-2">
                    <Favicon src={item.icon} showDefaultIcon />
                    <div className="flex min-w-0 flex-col">
                      <Link
                        href={item.url}
                        color="foreground"
                        isExternal
                        size="sm"
                        className="truncate font-medium"
                      >
                        {item.name}
                      </Link>
                      {item.description && (
                        <span className="text-default-500 line-clamp-1 text-xs">
                          {item.description}
                        </span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-default-600 line-clamp-2 text-sm">
                    {item.relatedTagNames.join('、') || '-'}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-default-500 text-sm">{formatDate(item.publishRequestedAt)}</span>
                </TableCell>
                <TableCell>
                  <Chip
                    size="sm"
                    variant="flat"
                    color={STATUS_OPTIONS.find((option) => option.key === item.publishStatus)?.color}
                  >
                    {STATUS_OPTIONS.find((option) => option.key === item.publishStatus)?.label ||
                      item.publishStatus}
                  </Chip>
                </TableCell>
                <TableCell>
                  {item.publishStatus === 'pending' || item.publishStatus === 'unpublishing' ? (
                    <div className="flex items-center gap-1">
                      <ReButton
                        size="sm"
                        color="success"
                        variant="flat"
                        isLoading={reviewingId === item.id}
                        onPress={() => confirmReview(item, true)}
                      >
                        通过
                      </ReButton>
                      <ReButton
                        size="sm"
                        color="danger"
                        variant="flat"
                        isDisabled={reviewingId === item.id}
                        onPress={() => confirmReview(item, false)}
                      >
                        拒绝
                      </ReButton>
                    </div>
                  ) : (
                    <span className="text-default-400 text-xs">
                      {item.publishStatus === 'rejected' ? item.publishRejectReason || '已拒绝' : '已处理'}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </AdminSurfaceCard>
    </div>
  )
}
