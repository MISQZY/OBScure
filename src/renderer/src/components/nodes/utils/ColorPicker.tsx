import { HexColorPicker, HexColorInput } from 'react-colorful'
import { NodePopover } from './NodePopover'

export function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5 nodrag">
      <HexColorInput
        color={value}
        onChange={onChange}
        prefixed
        className="font-mono text-[10px] text-muted-foreground uppercase bg-transparent w-[4.5rem] outline-none focus:text-foreground text-right border-b border-transparent focus:border-border transition-colors"
      />
      <NodePopover
        className="w-auto p-3 flex flex-col gap-3"
        trigger={
          <button
            type="button"
            className="size-5 rounded border shadow-sm ring-1 ring-border/50 cursor-pointer p-0 shrink-0"
            style={{ backgroundColor: value }}
          />
        }
      >
        <HexColorPicker color={value} onChange={onChange} />
        <HexColorInput
          color={value}
          onChange={onChange}
          prefixed
          className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono uppercase"
        />
      </NodePopover>
    </div>
  )
}
