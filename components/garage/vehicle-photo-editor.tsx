'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Camera, Loader2, ImagePlus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface VehiclePhotoEditorProps {
  vehicleId: string
  userId: string
  hasPhoto: boolean
}

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024 // 20 MB

function storagePath(userId: string, vehicleId: string) {
  return `${userId}/${vehicleId}/hero.jpg`
}

function resizeToJpeg(file: File, maxWidth = 1600, maxHeight = 1200, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      let { width, height } = img
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('Canvas not supported')); return }
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('Image compression failed')),
        'image/jpeg',
        quality,
      )
    }
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Failed to load image')) }
    img.src = objectUrl
  })
}

export function VehiclePhotoEditor({ vehicleId, userId, hasPhoto }: VehiclePhotoEditorProps) {
  const router = useRouter()
  const supabase = useRef(createClient()).current
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (fileInputRef.current) fileInputRef.current.value = ''

    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error('Image must be under 20 MB')
      return
    }

    setUploading(true)
    try {
      const compressed = await resizeToJpeg(file)
      const path = storagePath(userId, vehicleId)

      const { error: uploadError } = await supabase.storage
        .from('vehicle-photos')
        .upload(path, compressed, { contentType: 'image/jpeg', cacheControl: 'no-cache', upsert: true })

      if (uploadError) throw uploadError

      const { error: dbError } = await supabase
        .from('vehicles')
        .update({ photo_url: path })
        .eq('id', vehicleId)
        .eq('user_id', userId)

      if (dbError) {
        // Roll back the storage upload so we don't leave orphaned files
        await supabase.storage.from('vehicle-photos').remove([path])
        throw dbError
      }

      toast.success('Photo updated!')
      router.refresh()
    } catch (err) {
      toast.error('Upload failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setUploading(false)
    }
  }

  async function handleRemove() {
    setRemoving(true)
    try {
      const path = storagePath(userId, vehicleId)

      // Clear DB reference first. If this fails, the storage object is untouched
      // and state remains consistent. If storage deletion later fails, photo_url
      // is already null so the user sees the gradient fallback — a harmless orphan.
      const { error: dbError } = await supabase
        .from('vehicles')
        .update({ photo_url: null })
        .eq('id', vehicleId)
        .eq('user_id', userId)

      if (dbError) throw dbError

      const { error: storageError } = await supabase.storage
        .from('vehicle-photos')
        .remove([path])
      if (storageError) console.warn('Storage removal warning:', storageError.message)

      toast.success('Photo removed')
      router.refresh()
    } catch (err) {
      toast.error('Remove failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setRemoving(false)
    }
  }

  const isLoading = uploading || removing
  const buttonClass =
    'inline-flex items-center justify-center h-9 w-9 rounded-lg text-white/70 hover:text-white hover:bg-black/40 transition-colors disabled:opacity-50'

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileSelect}
        disabled={isLoading}
      />

      {hasPhoto ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            className={buttonClass}
            disabled={isLoading}
            aria-label="Photo options"
          >
            {isLoading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Camera className="h-4 w-4" />
            }
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-card border-border/60 w-44">
            <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
              <ImagePlus className="h-4 w-4 mr-2" />
              Change photo
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleRemove}
              className="text-danger focus:text-danger focus:bg-danger/10"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Remove photo
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          className={buttonClass}
          aria-label="Add photo"
        >
          {uploading
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Camera className="h-4 w-4" />
          }
        </button>
      )}
    </>
  )
}
