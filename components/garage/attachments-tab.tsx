'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { type Attachment } from '@/types'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Paperclip, Upload, FileText, Image as ImageIcon, Trash2, ExternalLink, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const SIGNED_URL_EXPIRY_SECONDS = 3600

interface AttachmentsTabProps {
  vehicleId: string
  userId: string
  attachments: Attachment[]
}

export function AttachmentsTab({ vehicleId, userId, attachments }: AttachmentsTabProps) {
  const router = useRouter()
  // Stable client reference — createBrowserClient is called once per component mount
  const supabase = useRef(createClient()).current
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [label, setLabel] = useState('')

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large (max 10MB)')
      return
    }

    setUploading(true)
    const ext = file.name.split('.').pop()
    // Path pattern required by storage RLS: {user_id}/{vehicle_id}/{timestamp}.{ext}
    const path = `${userId}/${vehicleId}/${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(path, file)

    if (uploadError) {
      toast.error('Upload failed: ' + uploadError.message)
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    // Store the storage path, not a URL. The bucket is private; access is via
    // signed URLs generated on demand — never via getPublicUrl().
    const { error: dbError } = await supabase.from('attachments').insert({
      vehicle_id: vehicleId,
      file_url: path,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      label: label.trim() || null,
    })

    if (dbError) {
      // Roll back the storage upload so we don't leave orphaned files
      await supabase.storage.from('attachments').remove([path])
      toast.error('Failed to save attachment')
    } else {
      toast.success('File uploaded!')
      setLabel('')
      router.refresh()
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleView(attachment: Attachment) {
    setViewingId(attachment.id)
    // Always generate a fresh signed URL — handles expiry without client-side caching
    const { data, error } = await supabase.storage
      .from('attachments')
      .createSignedUrl(attachment.file_url, SIGNED_URL_EXPIRY_SECONDS)
    setViewingId(null)
    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    } else {
      toast.error('Could not open file' + (error ? ': ' + error.message : ''))
    }
  }

  async function handleDelete(attachment: Attachment) {
    setDeletingId(attachment.id)
    // file_url is the storage path (e.g. {userId}/{vehicleId}/{ts}.ext)
    const { error: storageError } = await supabase.storage
      .from('attachments')
      .remove([attachment.file_url])

    if (storageError) {
      // File may already be gone; log and continue to clean up the DB row
      console.warn('Storage removal warning:', storageError.message)
    }

    const { error } = await supabase.from('attachments').delete().eq('id', attachment.id)
    if (error) {
      toast.error('Failed to delete')
    } else {
      toast.success('Deleted')
      router.refresh()
    }
    setDeletingId(null)
  }

  const isImage = (type: string) => type.startsWith('image/')

  return (
    <div className="space-y-4">
      {/* Upload area */}
      <div className="bg-card border border-dashed border-border rounded-2xl p-6 space-y-3">
        <div className="space-y-2">
          <Label htmlFor="label">Label (optional)</Label>
          <Input
            id="label"
            placeholder="e.g. Insurance Card, Registration, Receipt"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="bg-input border-border"
          />
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.doc,.docx"
          className="hidden"
          onChange={handleUpload}
          disabled={uploading}
        />
        <button
          type="button"
          className="w-full border border-dashed border-border hover:border-primary/50 hover:bg-primary/5 h-20 flex flex-col items-center justify-center gap-2 rounded-xl transition-colors disabled:opacity-50"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          ) : (
            <Upload className="h-6 w-6 text-primary" />
          )}
          <span className="text-sm font-medium">
            {uploading ? 'Uploading...' : 'Tap to upload photo or document'}
          </span>
          <span className="text-xs text-muted-foreground">Images, PDFs up to 10MB</span>
        </button>
      </div>

      {/* Attachments list */}
      {attachments.length === 0 ? (
        <div className="text-center py-8 bg-card border border-dashed border-border rounded-2xl">
          <Paperclip className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="text-muted-foreground font-medium">No documents yet</p>
          <p className="text-sm text-muted-foreground">Upload insurance, registration, receipts, and photos</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                {isImage(attachment.file_type)
                  ? <ImageIcon className="h-5 w-5 text-primary" />
                  : <FileText className="h-5 w-5 text-primary" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{attachment.label || attachment.file_name}</p>
                <p className="text-xs text-muted-foreground truncate">{attachment.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(attachment.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleView(attachment)}
                  disabled={viewingId === attachment.id}
                  className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'text-muted-foreground hover:text-primary hover:bg-primary/10 disabled:opacity-50')}
                  aria-label="Open file"
                >
                  {viewingId === attachment.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <ExternalLink className="h-3.5 w-3.5" />
                  }
                </button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-danger hover:bg-danger/10"
                  onClick={() => handleDelete(attachment)}
                  disabled={deletingId === attachment.id}
                >
                  {deletingId === attachment.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5" />
                  }
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
