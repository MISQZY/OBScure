import React from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'
import { Checkbox } from '@/components/ui/checkbox'

import { VIDEO_SOCKETS, VIDEO_OUTPUTS } from './constants'
import { useSavedNodeData, BaseNode, Field, NumberInput, ColorPicker, numberInputClass, textInputClass } from './utils'

/**
 * A short video clip (URL only — no upload, unlike Image/Sound; point it at
 * a file already reachable over HTTP) — for reaction gifs-as-video/animated
 * logos/meme clips in an alert, which Image/Lottie-less Animation can't
 * cover. Muted by default: browsers block unmuted autoplay outright, and
 * OBS's embedded Browser Source is no exception — a Sound node wired
 * alongside it is the reliable way to get audio out of an alert anyway (see
 * SoundNode). Connect into a Box/Group or straight into Scene, same as Image.
 */
export function VideoNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const saved = useSavedNodeData(id)
  const muted = data.muted !== false
  const loop = data.loop !== false
  const borderEnabled = Boolean(data.borderEnabled)
  return (
    <BaseNode
      id={id}
      data={data}
      title="Video"
      labelable
      category="content"
      sockets={VIDEO_SOCKETS}
      outputSockets={VIDEO_OUTPUTS}
      help="Defaults to 320×180 — wire a Size node to override."
    >
      <div className="flex flex-col gap-1 text-xs">
        <label>Video URL</label>
        <input
          type="text"
          placeholder="https://…/clip.mp4"
          value={(data.src as string) || ''}
          onChange={(e) => updateNodeData(id, { src: e.target.value })}
          className={textInputClass}
        />
      </div>
      <Field label="Radius">
        <NumberInput value={data.borderRadius as number} onChange={(v) => updateNodeData(id, { borderRadius: v })} min={0} fallback={8} savedValue={saved.borderRadius as number} className={numberInputClass} />
      </Field>
      <Field label="Loop">
        <Checkbox checked={loop} onCheckedChange={(checked) => updateNodeData(id, { loop: !!checked })} className="nodrag" />
      </Field>
      <Field label="Muted">
        <Checkbox checked={muted} onCheckedChange={(checked) => updateNodeData(id, { muted: !!checked })} className="nodrag" title="Off relies on OBS/the browser allowing autoplaying audio — not guaranteed. Pair with a Sound node for reliable audio instead." />
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
