import React, { useState } from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'
import { SOUND_IDS } from '@shared/sounds'

import { BaseNode, Field, NodeSelect, UploadRow } from './utils'

/** Alert sound + volume — see SoundId. Connect into Scene to say this scene plays a sound. Custom uploaded sounds aren't picked from here; choose a bundled preset or none. */
export function SoundNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const [uploading, setUploading] = useState(false)
  const soundId = (data.soundId as string) || 'none'
  const customSoundName = (data.customSoundName as string) || null

  const upload = async (): Promise<void> => {
    setUploading(true)
    try {
      const result = await window.obscure.uploadCustomSound(customSoundName)
      if (result) updateNodeData(id, { soundId: 'custom', customSoundName: result.fileName })
    } finally {
      setUploading(false)
    }
  }

  const removeCustom = async (): Promise<void> => {
    if (!customSoundName) return
    await window.obscure.removeCustomSound(customSoundName)
    updateNodeData(id, { soundId: 'none', customSoundName: null })
  }

  return (
    <BaseNode id={id} data={data} title="Sound" category="data">
      <Field label="Sound">
        <NodeSelect
          value={soundId}
          // 'custom' only appears once there's actually an uploaded file to
          // select — same convention as AlertSoundPicker's Select
          // (components/AlertSoundPicker.tsx), so it can't be picked before
          // one exists.
          options={customSoundName ? SOUND_IDS : SOUND_IDS.filter((sid) => sid !== 'custom')}
          onChange={(next) => updateNodeData(id, { soundId: next })}
          renderOption={(opt) => (opt === 'custom' ? 'custom' : opt)}
        />
      </Field>
      {/* Persists in the app's own writable custom-sounds directory (see
          main/index.ts) until Remove, independent of this node/scene — a
          distinct file per upload (this node's own, not shared with
          AlertSoundPicker's custom-sound slot elsewhere in the app, even
          though both write into the same directory). */}
      <UploadRow uploading={uploading} hasCustom={Boolean(customSoundName)} onUpload={() => void upload()} onRemove={() => void removeCustom()} label={customSoundName ? 'Replace' : 'Upload'} />
      <Field label="Volume">
        <input type="range" min="0" max="1" step="0.05" value={data.volume as number ?? 1} onChange={(e) => updateNodeData(id, { volume: Number(e.target.value) })} className="nodrag w-24" />
      </Field>
    </BaseNode>
  )
}
