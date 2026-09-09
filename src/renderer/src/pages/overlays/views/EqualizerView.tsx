import { useEffect, useState } from "react";
import { Node } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { isGradientColor } from "@/lib/gradient";
import { radiusCss, Anim } from "../sceneUtils";

/**
 * Bar/wave/dot visualizer — decorative in the editor preview ONLY. Real
 * audio capture happens in the Electron app's own hidden capture window
 * (see main/audioCapture.ts), never inside the React tree, so there is no
 * live feed to read here even when a real Audio Source is wired in — this
 * just animates each bar with a bounded random walk (paced/scaled by the
 * node's own Speed/Intensity fields) so Style/Color/Size/Radius choices can
 * still be previewed live. The actual OBS-rendered overlay (buildEqualizer
 * in overlays/custom-builders.js) drives the exact same visual shape from
 * real band levels pushed over the live WebSocket channel instead.
 */
export function EqualizerView({
  node,
  style,
  anim,
  played,
  hiding
}: {
  node: Node
  style: React.CSSProperties
  anim: Anim
  played: boolean
  hiding: boolean
}) {
  const d = node.data
  const barCount = Math.max(2, Math.min(96, (d.barCount as number) ?? 24))
  const styleType = d.style === 'wave' || d.style === 'dot' ? (d.style as 'wave' | 'dot') : 'bar'
  const speed = (d.speed as number) || 1
  const intensity = (d.intensity as number) || 1
  const color = (d.color as string) || '#8b5cf6'
  const [levels, setLevels] = useState<number[]>(() => Array.from({ length: barCount }, () => Math.random()))

  useEffect(() => {
    setLevels((prev) => (prev.length === barCount ? prev : Array.from({ length: barCount }, () => Math.random())))
  }, [barCount])

  useEffect(() => {
    const intervalMs = Math.max(40, 220 / speed)
    const id = setInterval(() => {
      setLevels((prev) => prev.map((v) => Math.max(0, Math.min(1, v + (Math.random() - 0.5) * 0.6 * intensity))))
    }, intervalMs)
    return () => clearInterval(id)
  }, [speed, intensity])

  const fillImage = isGradientColor(color) ? color : `linear-gradient(${color}, ${color})`
  const transitionMs = Math.max(20, Math.round(260 / speed))

  return (
    <div
      className={cn('relative overflow-hidden shrink-0 flex flex-row gap-0.5', anim && played && 'visible', anim && hiding && 'hiding')}
      data-animation={anim?.type}
      style={
        {
          width: (d.width as number) ?? 240,
          height: (d.height as number) ?? 80,
          alignItems: styleType === 'bar' ? 'flex-end' : 'center',
          ...style,
          borderRadius: radiusCss(node.data, 8),
          ...(anim?.duration ? { '--anim-duration': `${anim.duration}ms` } : {})
        } as React.CSSProperties
      }
    >
      {levels.map((level, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            minWidth: 0,
            backgroundImage: fillImage,
            transition: styleType === 'dot' ? `transform ${transitionMs}ms linear` : `height ${transitionMs}ms linear`,
            ...(styleType === 'dot'
              ? { aspectRatio: '1 / 1', borderRadius: '50%', transform: `scale(${0.3 + level * 1.3})`, margin: 'auto 0' }
              : { height: `${4 + level * 96}%`, borderRadius: styleType === 'wave' ? 999 : '2px 2px 0 0' })
          }}
        />
      ))}
    </div>
  )
}
