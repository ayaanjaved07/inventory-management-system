import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ImagePlus, Star, Trash2 } from 'lucide-react'

import { api, apiError } from '@/lib/api'
import type { ItemImage } from '@/lib/types'
import { Button, ErrorNote, Spinner } from '@/components/ui'

/**
 * Image gallery + upload for one item.
 *
 * Content-Type is deliberately never set on the FormData request: axios omits
 * it so the browser can generate the multipart boundary itself. Setting it by
 * hand produces a header with no boundary and Django parses nothing.
 */
export function ImageUploader({ itemId, canEdit }: { itemId: number | string; canEdit: boolean }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')

  const images = useQuery({
    queryKey: ['item-images', itemId],
    queryFn: async () => (await api.get<ItemImage[]>(`/items/${itemId}/images/`)).data,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['item-images', itemId] })
    // The list and detail views embed primary_image, so they are stale too.
    queryClient.invalidateQueries({ queryKey: ['items'] })
    queryClient.invalidateQueries({ queryKey: ['item', String(itemId)] })
  }

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData()
      body.append('image', file)
      body.append('alt_text', file.name)
      // First image uploaded becomes the primary one, so an item always has a
      // thumbnail without the user having to pick one.
      body.append('is_primary', (images.data?.length ?? 0) === 0 ? 'true' : 'false')
      return (await api.post<ItemImage>(`/items/${itemId}/images/`, body)).data
    },
    onSuccess: () => {
      setError('')
      invalidate()
      if (fileInput.current) fileInput.current.value = ''
    },
    onError: (err) => setError(apiError(err)),
  })

  const setPrimary = useMutation({
    mutationFn: async (id: number) =>
      (await api.patch(`/item-images/${id}/`, { is_primary: true })).data,
    onSuccess: invalidate,
    onError: (err) => setError(apiError(err)),
  })

  const remove = useMutation({
    mutationFn: async (id: number) => api.delete(`/item-images/${id}/`),
    onSuccess: invalidate,
    onError: (err) => setError(apiError(err)),
  })

  const gallery = images.data ?? []

  return (
    <div className="space-y-3">
      {error && <ErrorNote message={error} />}

      {images.isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner className="h-6 w-6" />
        </div>
      ) : gallery.length === 0 ? (
        <p className="text-sm text-slate-500">{t('items.noImages')}</p>
      ) : (
        <ul className="flex flex-wrap gap-3">
          {gallery.map((image) => (
            <li
              key={image.id}
              className="group relative h-28 w-28 overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
            >
              <img
                src={image.image}
                alt={image.alt_text || t('items.imageAlt')}
                className="h-full w-full object-cover"
              />
              {image.is_primary && (
                <span className="absolute left-1 top-1 rounded bg-teal-700 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  {t('items.primary')}
                </span>
              )}
              {canEdit && (
                <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-slate-900/60 p-1 opacity-0 transition group-hover:opacity-100">
                  {!image.is_primary && (
                    <button
                      className="rounded p-1 text-white hover:bg-white/20"
                      onClick={() => setPrimary.mutate(image.id)}
                      aria-label={t('items.makePrimary')}
                      title={t('items.makePrimary')}
                    >
                      <Star className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    className="rounded p-1 text-white hover:bg-white/20"
                    onClick={() => remove.mutate(image.id)}
                    aria-label={t('common.delete')}
                    title={t('common.delete')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="flex items-center gap-3">
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) upload.mutate(file)
            }}
          />
          <Button
            variant="secondary"
            onClick={() => fileInput.current?.click()}
            disabled={upload.isPending}
          >
            <ImagePlus className="h-4 w-4" />
            {upload.isPending ? t('common.loading') : t('items.addImage')}
          </Button>
        </div>
      )}
    </div>
  )
}
