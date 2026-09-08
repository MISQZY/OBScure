import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui'
import { useI18n } from '@/providers/I18nProvider'
import { interpolate } from '@/lib/i18n/interpolate'
import { useGlobalVariables } from '@/providers/GlobalVariablesProvider'
import { sanitizePlaceholderName, VARIABLE_TYPES, coerceVariableValue } from '@/components/nodes'
import type { GlobalVariable, VariableDataType } from '@shared/types'

/** Value column's own editor per type — a Switch for 'boolean', a plain text Input for 'string', otherwise a numeric Input (step=1 for 'int', step="any" for 'float' — matches coerceVariableValue's own int-rounds-float-doesn't split). */
function valueInputProps(type: VariableDataType): { type: string; step?: string } {
  if (type === 'string') return { type: 'text' }
  if (type === 'int') return { type: 'number', step: '1' }
  return { type: 'number', step: 'any' }
}

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
  const [newType, setNewType] = useState<VariableDataType>('float')
  const [newValue, setNewValue] = useState('0')
  const [newBoolValue, setNewBoolValue] = useState(false)

  const nameExists = (name: string, excludeId?: string): boolean =>
    variables.some((v) => v.id !== excludeId && v.name.toLowerCase() === name.toLowerCase())

  const addVariable = async (): Promise<void> => {
    const name = sanitizePlaceholderName(newName)
    if (!name || nameExists(name)) return
    const id = `var-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const value = newType === 'boolean' ? newBoolValue : coerceVariableValue(newType, newValue)
    await saveVariable({ id, name, type: newType, value })
    setNewName('')
    setNewValue('0')
    setNewBoolValue(false)
  }

  const renameVariable = async (variable: GlobalVariable, rawName: string): Promise<void> => {
    const name = sanitizePlaceholderName(rawName)
    if (!name || nameExists(name, variable.id) || name === variable.name) return
    await saveVariable({ ...variable, name })
  }

  const updateType = async (variable: GlobalVariable, nextType: VariableDataType): Promise<void> => {
    if (nextType === (variable.type || 'float')) return
    await saveVariable({ ...variable, type: nextType, value: coerceVariableValue(nextType, variable.value) })
  }

  const updateValue = async (variable: GlobalVariable, rawValue: string): Promise<void> => {
    const value = coerceVariableValue(variable.type || 'float', rawValue)
    if (value === variable.value) return
    await saveVariable({ ...variable, value })
  }

  const updateBoolValue = async (variable: GlobalVariable, checked: boolean): Promise<void> => {
    if (checked === variable.value) return
    await saveVariable({ ...variable, value: checked })
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
              <Label htmlFor="new-variable-type">{t.variables.typeLabel}</Label>
              <Select value={newType} onValueChange={(next) => setNewType(next as VariableDataType)}>
                <SelectTrigger id="new-variable-type" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VARIABLE_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {t.variables.types[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-variable-value">{t.variables.valueLabel}</Label>
              {newType === 'boolean' ? (
                <div className="flex h-9 w-28 items-center">
                  <Switch id="new-variable-value" checked={newBoolValue} onCheckedChange={setNewBoolValue} />
                </div>
              ) : (
                <Input
                  id="new-variable-value"
                  className="w-28"
                  value={newValue}
                  onChange={(event) => setNewValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && canAdd) void addVariable()
                  }}
                  {...valueInputProps(newType)}
                />
              )}
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
              {variables.map((variable) => {
                const type = variable.type || 'float'
                return (
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
                    <Select value={type} onValueChange={(next) => void updateType(variable, next as VariableDataType)}>
                      <SelectTrigger className="h-8 w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VARIABLE_TYPES.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {t.variables.types[opt]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {type === 'boolean' ? (
                      <div className="flex h-8 w-28 items-center">
                        <Switch checked={!!variable.value} onCheckedChange={(checked) => void updateBoolValue(variable, checked)} />
                      </div>
                    ) : (
                      <Input
                        defaultValue={String(variable.value)}
                        key={`${variable.id}-value-${variable.value}`}
                        className="h-8 w-28"
                        onBlur={(event) => void updateValue(variable, event.target.value)}
                        {...valueInputProps(type)}
                      />
                    )}
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
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
