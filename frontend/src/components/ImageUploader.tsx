import { useState } from 'react'
import type { ChangeEvent } from 'react'

import { apiDelete, apiPatch, apiPost, errorMessage } from '../lib/api'
import { useApi } from '../lib/useApi'
import type { ItemImage } from '../lib/types'

// Shows an item's images and lets the user add, delete or pick the main one.
export function ImageUploader({ itemId, canEdit }: { itemId: number; canEdit: boolean }) {
  const images = useApi<ItemImage[]>(`/items/${itemId}/images/`)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  const gallery = images.data || []

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target
    if (!input.files || input.files.length === 0) return
    const file = input.files[0]

    const body = new FormData()
    body.append('image', file)
    body.append('alt_text', file.name)
    // The first image uploaded becomes the item's main picture.
    body.append('is_primary', gallery.length === 0 ? 'true' : 'false')

    setUploading(true)
    try {
      await apiPost(`/items/${itemId}/images/`, body)
      setError('')
      images.reload()
    } catch (err) {
      setError(errorMessage(err))
    }
    setUploading(false)
    // Clear the file input so the same file can be picked again.
    input.value = ''
  }

  async function makePrimary(id: number) {
    try {
      await apiPatch(`/item-images/${id}/`, { is_primary: true })
      images.reload()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function remove(id: number) {
    try {
      await apiDelete(`/item-images/${id}/`)
      images.reload()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <>
      {error && <p className="error">{error}</p>}

      {images.loading && !images.data && <p>Loading...</p>}
      {images.data && gallery.length === 0 && <p className="muted">No images yet.</p>}

      <div className="gallery">
        {gallery.map((image) => (
          <div key={image.id}>
            <img src={image.image} alt={image.alt_text || 'Item photo'} />
            {image.is_primary && <span className="badge green">Main</span>}
            {canEdit && (
              <div className="row" style={{ marginTop: 4 }}>
                {!image.is_primary && (
                  <button className="secondary small" onClick={() => makePrimary(image.id)}>
                    Make main
                  </button>
                )}
                <button className="secondary small" onClick={() => remove(image.id)}>
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {canEdit && (
        <label>
          Add image
          <input type="file" accept="image/*" disabled={uploading} onChange={upload} />
          {uploading && <span className="hint">Uploading...</span>}
        </label>
      )}
    </>
  )
}
