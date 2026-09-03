import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { useI18n } from '@/providers/I18nProvider'
import { interpolate } from '@/lib/i18n/interpolate'
import { useGlobalVariables } from '@/providers/GlobalVariablesProvider'
import { sanitizePlaceholderName } from '@/components/nodes'
import type { GlobalVariable } from '@shared/types'

/**
 * "Данные → Переменные" — registers the global variables a Variable node's
 * own scope=global picker (VariableNode.tsx) references, and every
 * ProgressView/buildProgress reads live values from (see
 * OverlayServer.setGlobalVariables). Each `name` here doubles as its
 * `{name}` template placeholder — see sanitizePlaceholderName's own doc
 * comment in components/nodes/utils/constants.ts.
 */
export function VariablesPage() {
  const { t } = useI18n()
  const { variables, saveVariable, deleteVariable } = useGlobalVariables()
  const [newName, setNewName] = useState('')
  const [newValue, setNewValue] = useState('0')

  const nameExists = (name: string, excludeId?: string): boolean =>
    variables.some((v) => v.id !== excludeId && v.name.toLowerCase() === name.toLowerCase())

  const addVariable = async (): Promise<void> => {
    const name = sanitizePlaceholderName(newName)
    if (!name || nameExists(name)) return
    const id = `var-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    await saveVariable({ id, name, value: Number(newValue) || 0 })
    setNewName('')
    setNewValue('0')
  }

  const renameVariable = async (variable: GlobalVariable, rawName: string): Promise<void> => {
    const name = sanitizePlaceholderName(rawName)
    if (!name || nameExists(name, variable.id) || name === variable.name) return
    await saveVariable({ ...variable, name })
  }

  const updateValue = async (variable: GlobalVariable, rawValue: string): Promise<void> => {
    const value = Number(rawValue)
    if (Number.isNaN(value) || value === variable.value) return
    await saveVariable({ ...variable, value })
  }

  const canAdd = sanitizePlaceholderName(newName).length > 0 && !nameExists(sanitizePlaceholderName(newName))

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 min-[1440px]:max-w-none">
      <div>
        <h1 className="text-xl font-semibold">{t.variables.title}</h1>
        <p className="text-sm text-muted-foreground">{t.variables.description}</p>
      </div>

      {/* Add-variable form on the left (fixed width), the existing list on the right from 1440px up. */}
      <div className="flex flex-col gap-6 min-[1440px]:flex-row min-[1440px]:items-start">
        <div className="flex flex-col gap-3 min-[1440px]:w-64 min-[1440px]:shrink-0">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-variable-name">{t.variables.namePlaceholder}</Label>
              <Input
                id="new-variable-name"
                className="w-48"
                placeholder={t.variables.namePlaceholder}
                value={newName}
                onChange={(event) => setNewName(sanitizePlaceholderName(event.target.value))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && canAdd) void addVariable()
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-variable-value">{t.variables.valueLabel}</Label>
              <Input
                id="new-variable-value"
                type="number"
                className="w-28"
                value={newValue}
                onChange={(event) => setNewValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && canAdd) void addVariable()
                }}
              />
            </div>
            <Button onClick={addVariable} disabled={!canAdd} size="sm">
              <Plus className="size-4" />
              {t.variables.add}
            </Button>
          </div>
          {newName.length > 0 && !canAdd && sanitizePlaceholderName(newName) && (
            <p className="text-xs text-destructive">{t.variables.nameTaken}</p>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {variables.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.variables.empty}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {variables.map((variable) => (
                <li key={variable.id} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Input
                      defaultValue={variable.name}
                      key={`${variable.id}-name`}
                      className="h-7 w-full max-w-sm font-mono text-sm"
                      onChange={(event) => (event.target.value = sanitizePlaceholderName(event.target.value))}
                      onBlur={(event) => void renameVariable(variable, event.target.value)}
                    />
                    <span className="text-xs text-muted-foreground">
                      {t.variables.placeholderLabel}: {`{${variable.name}}`}
                    </span>
                  </div>
                  <Input
                    type="number"
                    defaultValue={variable.value}
                    key={`${variable.id}-value-${variable.value}`}
                    className="h-8 w-28"
                    onBlur={(event) => void updateValue(variable, event.target.value)}
                  />
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        type="button"
                        className="flex shrink-0 items-center justify-center rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title={t.variables.deleteTooltip}
                        aria-label={t.variables.deleteTooltip}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogTitle>{interpolate(t.variables.deleteConfirm, { name: variable.name })}</AlertDialogTitle>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={() => deleteVariable(variable.id)}>
                          {t.common.delete}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
