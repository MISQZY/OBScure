import React, { createContext, useContext, useMemo } from 'react'

export type SavedNodeMap = Record<string, Record<string, unknown>>

export const SavedNodeDataContext = createContext<SavedNodeMap>({})

/**
 * Wraps the `<ReactFlow>` tree in SceneBuilderPage with each node's data AS
 * OF THE LAST SAVE — a separate snapshot from the `nodes` state ReactFlow
 * actually renders (which holds live, possibly-unsaved edits). Exists so
 * NumberInput can fall back to what's genuinely persisted when a field is
 * cleared (see useSavedNodeData/NumberInput's `savedValue`) instead of
 * either the type's generic default or an edit that was never Saved.
 * `savedNodes` is `overlay?.nodes` — undefined before the scene has ever
 * been loaded/saved, same as no saved value existing yet for any field.
 */
export function SavedNodeDataProvider({
  savedNodes,
  children
}: {
  savedNodes: { id: string; data?: Record<string, unknown> }[] | undefined
  children: React.ReactNode
}) {
  const map = useMemo(() => {
    const result: SavedNodeMap = {}
    for (const node of savedNodes ?? []) result[node.id] = node.data ?? {}
    return result
  }, [savedNodes])
  return <SavedNodeDataContext.Provider value={map}>{children}</SavedNodeDataContext.Provider>
}

/** This node's data as of the last Save, or `{}` before anything's been saved — see SavedNodeDataProvider above. */
export function useSavedNodeData(id: string): Record<string, unknown> {
  return useContext(SavedNodeDataContext)[id] ?? {}
}
