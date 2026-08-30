import React, { useState } from 'react'
import { Handle, NodeProps, NodeResizer, Position, useReactFlow } from '@xyflow/react'
import { ChevronDown, Copy, Pencil, Trash2 } from 'lucide-react'
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'
import { CATEGORY_STYLES, CATEGORY_DOT } from './constants'

export function FrameNode({ id, data, selected }: NodeProps) {
  const { setNodes, deleteElements, getNode, addNodes } = useReactFlow()
  const title = (data.label as string) || 'Group / Layout'
  const collapsed = Boolean(data.collapsed)
  const [isEditing, setIsEditing] = useState(false)
  const categoryStyle = CATEGORY_STYLES.utils

  /**
   * NodeResizer persists its size as explicit `node.width`/`node.height` —
   * React Flow keeps forcing the node wrapper's DOM to that exact size
   * forever after (see getNodeInlineStyleDimensions in @xyflow/react),
   * regardless of what the node's own content actually needs. Collapsing
   * only shrinks FrameNode's OWN inner markup to the header (`h-auto`) —
   * without also clearing the persisted width/height, the wrapper stayed at
   * its old expanded size, leaving an invisible "ghost" area that was still
   * hit-tested for dragging and for getIntersectingNodes (onNodeDragStop in
   * SceneBuilderPage.tsx) even though nothing was visibly there. Stash the
   * expanded size in `data` before clearing it so expanding can restore it.
   */
  const toggleCollapse = () => {
    const nextCollapsed = !collapsed
    setNodes((nodes) =>
      nodes.map((n) => {
        if (n.id === id) {
          return {
            ...n,
            data: {
              ...n.data,
              collapsed: nextCollapsed,
              ...(nextCollapsed ? { expandedWidth: n.width ?? n.data.expandedWidth, expandedHeight: n.height ?? n.data.expandedHeight } : {})
            },
            width: nextCollapsed ? undefined : ((n.data.expandedWidth as number | undefined) ?? n.width),
            height: nextCollapsed ? undefined : ((n.data.expandedHeight as number | undefined) ?? n.height)
          }
        }
        if (n.parentId === id) {
          return { ...n, hidden: nextCollapsed }
        }
        return n
      })
    )
  }

  const onTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNodes((nodes) =>
      nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, label: e.target.value } } : n))
    )
  }

  /** Same shape as BaseNode's own duplicateNode (components/nodes/utils.tsx) — a fresh, unconnected copy right next to the original, so a Frame duplicates the same way every other node does. Its children aren't cloned along with it, same as duplicating any other node never clones what's wired into it. */
  const duplicateNode = () => {
    const current = getNode(id)
    if (!current) return
    addNodes({
      ...current,
      id: `frame-${Date.now()}`,
      position: { x: current.position.x + 32, y: current.position.y + 32 },
      data: structuredClone(current.data),
      selected: false
    })
  }

  return (
    <>
      <NodeResizer
        color="hsl(var(--primary))"
        isVisible={selected && !collapsed}
        minWidth={200}
        minHeight={150}
      />
      <div
        className={cn(
          'relative flex flex-col rounded-md border shadow-sm transition-colors overflow-hidden group',
          selected ? 'border-primary bg-primary/10' : 'border-muted bg-muted/20',
          collapsed ? 'h-auto' : 'h-full'
        )}
        style={{ minWidth: 200, minHeight: collapsed ? 'auto' : 150 }}
      >
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              className={cn(
                'px-3 py-2 font-semibold text-sm flex justify-between items-center gap-2 relative z-10',
                categoryStyle.header,
                'border-b'
              )}
            >
              <div
                onClick={toggleCollapse}
                className="flex items-center gap-1.5 min-w-0 flex-1 text-left cursor-pointer"
                title={collapsed ? 'Expand' : 'Collapse'}
              >
                <ChevronDown className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', collapsed && '-rotate-90')} />
                {isEditing ? (
                  <input
                    type="text"
                    autoFocus
                    onBlur={() => setIsEditing(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setIsEditing(false)
                    }}
                    className="nodrag bg-background px-1 outline-none text-sm font-semibold w-full text-foreground rounded border border-input"
                    value={title}
                    onChange={onTitleChange}
                    placeholder="Frame Title"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <span className="truncate">{title}</span>
                    <Pencil
                      className="size-3 text-muted-foreground/50 hover:text-foreground transition-colors shrink-0 nodrag cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation()
                        setIsEditing(true)
                      }}
                    />
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => deleteElements({ nodes: [{ id }] })}
                className="nodrag shrink-0 text-muted-foreground hover:text-destructive transition-colors outline-none cursor-pointer"
                title="Delete node"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onSelect={toggleCollapse}>
              <ChevronDown className={cn('size-4', collapsed && '-rotate-90')} />
              {collapsed ? 'Expand' : 'Collapse'}
            </ContextMenuItem>
            <ContextMenuItem onSelect={duplicateNode}>
              <Copy className="size-4" />
              Duplicate
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onSelect={() => deleteElements({ nodes: [{ id }] })}>
              <Trash2 className="size-4" />
              Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>

        {!collapsed && <div className="nodrag flex-1 pointer-events-none" />}

        {/*
         * A child hidden by this collapse (see toggleCollapse above) has no
         * Handle of its own left in the DOM for React Flow to anchor an
         * edge to, so any wire it had to something OUTSIDE this Frame would
         * simply vanish the moment it collapses. displayEdges (sceneUtils)
         * redirects those wires to land here instead — non-interactive
         * (isConnectable false, pointer-events none) since these exist
         * purely as an anchor point, not a real socket a user can wire into
         * by hand.
         */}
        {collapsed && (
          <>
            <Handle
              type="target"
              position={Position.Left}
              id="frame-target"
              isConnectable={false}
              className={cn('w-3 h-3', CATEGORY_DOT.utils)}
              style={{ pointerEvents: 'none' }}
              title="Incoming connections (collapsed)"
            />
            <Handle
              type="source"
              position={Position.Right}
              id="frame-source"
              isConnectable={false}
              className={cn('w-3 h-3', CATEGORY_DOT.utils)}
              style={{ pointerEvents: 'none' }}
              title="Outgoing connections (collapsed)"
            />
          </>
        )}
      </div>
    </>
  )
}
