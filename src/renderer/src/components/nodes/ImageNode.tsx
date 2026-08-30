import React, { useState } from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'

import { IMAGE_SOCKETS, IMAGE_OUTPUTS } from './constants'
import { useSavedNodeData, BaseNode, Field, NumberInput, ColorPicker, numberInputClass, textInputClass, UploadRow, useHasIncomingEdge } from './utils'

/** A static image or (left blank) the live now-playing album art — see showAlbumArt. Connect into a Box/Group or straight into Scene. */
export function ImageNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const saved = useSavedNodeData(id)
  const [uploading, setUploading] = useState(false)
  const customImageName = (data.customImageName as string) || null
  const borderEnabled = Boolean(data.borderEnabled)
  // Audio Player's Content output wired into this node's Content socket (see
  // IMAGE_SOCKETS/AUDIO_PLAYER_OUTPUTS) already decides what's shown, same
  // priority buildImage in overlays/custom.html gives it — the URL field
  // goes read-only rather than sitting there editable but silently ignored.
  const contentConnected = useHasIncomingEdge(id, 'imageContent')

  const upload = async (): Promise<void> => {
    setUploading(true)
    try {
      const result = await window.maddoner.uploadCustomImage(customImageName)
      if (result) updateNodeData(id, { customImageName: result.fileName })
    } finally {
      setUploading(false)
    }
  }

  const removeCustom = async (): Promise<void> => {
    if (!customImageName) return
    await window.maddoner.removeCustomImage(customImageName)
    updateNodeData(id, { customImageName: null })
  }

  return (
    <BaseNode
      id={id}
      data={data}
      title="Image"
      labelable
      category="content"
      sockets={IMAGE_SOCKETS}
      outputSockets={IMAGE_OUTPUTS}
      help="Leave URL empty for the live now-playing album art, or wire Audio Player's Content output into Content for the same thing made explicit (URL field goes read-only). Defaults to 96×96 — wire a Size node to override."
    >
      <div className="flex flex-col gap-1 text-xs">
        <label>Image URL</label>
        <input
          type="text"
          placeholder={contentConnected ? 'Provided by Content connection' : customImageName ? 'Uploaded file in use' : 'Leave empty for album art'}
          disabled={contentConnected || Boolean(customImageName)}
          value={(data.src as string) || ''}
          onChange={(e) => updateNodeData(id, { src: e.target.value })}
          className={cn(textInputClass, (contentConnected || customImageName) && 'opacity-50')}
        />
      </div>
      {/* Uploaded file takes priority over the URL above (see ImageView in
          SceneBuilderPage.tsx / buildImage in overlays/custom.html) —
          copied into the app's own writable custom-images directory, so it
          keeps working from any machine without depending on an external
          URL staying online. Persists there until Remove, independent of
          this node/scene. */}
      <UploadRow uploading={uploading} hasCustom={Boolean(customImageName)} onUpload={() => void upload()} onRemove={() => void removeCustom()} label={customImageName ? 'Replace' : 'Upload'} />
      <Field label="Radius">
        <NumberInput value={data.borderRadius as number} onChange={(v) => updateNodeData(id, { borderRadius: v })} min={0} fallback={8} savedValue={saved.borderRadius as number} className={numberInputClass} />
      </Field>
      <Field label="Border">
        <Checkbox checked={borderEnabled} onCheckedChange={(checked) => updateNodeData(id, { borderEnabled: !!checked })} className="nodrag" />
      </Field>
      {borderEnabled && (
        <>
          <Field label="Border width">
            <NumberInput value={data.borderWidth as number} onChange={(v) => updateNodeData(id, { borderWidth: v })} min={0} fallback={2} savedValue={saved.borderWidth as number} className={numberInputClass} />
          </Field>
          <Field label="Border color">
            <ColorPicker value={(data.borderColor as string) || '#ffffff'} onChange={(val) => updateNodeData(id, { borderColor: val })} />
          </Field>
        </>
      )}
    </BaseNode>
  )
}
