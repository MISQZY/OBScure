import { Upload, X } from 'lucide-react'

/**
 * Upload/Remove row for a node-level file upload (ImageNode, SoundNode) —
 * mirrors AlertSoundPicker's upload/remove buttons (components/
 * AlertSoundPicker.tsx) in miniature, for the compact node-UI context.
 * Files themselves persist in the app's own writable directory
 * (userData/custom-images or custom-sounds — see main/index.ts) until
 * explicitly removed here, independent of any particular scene/node using
 * them — same lifetime as a bundled preset asset.
 */
export function UploadRow({
  uploading,
  hasCustom,
  onUpload,
  onRemove,
  label
}: {
  uploading: boolean
  hasCustom: boolean
  onUpload: () => void
  onRemove: () => void
  label: string
}) {
  return (
    <div className="nodrag flex items-center gap-1.5">
      <button
        type="button"
        onClick={onUpload}
        disabled={uploading}
        className="flex items-center gap-1 text-[11px] py-1 px-2 rounded bg-muted hover:bg-accent border border-transparent hover:border-border transition-colors disabled:opacity-50"
      >
        <Upload className="size-3" />
        {uploading ? 'Uploading…' : label}
      </button>
      {hasCustom && (
        <button
          type="button"
          onClick={onRemove}
          title="Remove uploaded file"
          className="flex items-center justify-center size-6 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}
