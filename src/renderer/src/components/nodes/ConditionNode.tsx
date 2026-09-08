import React from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'
import { ALERT_PLATFORMS, type AlertPlatform } from '@shared/types'

import { useI18n } from '@/providers/I18nProvider'
import { CONDITION_OUTPUTS } from './constants'
import {
  BaseNode,
  Field,
  NodeSelect,
  textInputClass,
  ALERT_PLATFORM_LABELS,
  CONDITION_FIELDS,
  CONDITION_FIELD_LABELS,
  CONDITION_OPERATOR_LABELS,
  NUMERIC_CONDITION_OPERATORS,
  STRING_CONDITION_OPERATORS,
  type ConditionOperator
} from './utils'

/**
 * Branches the process sequence-flow in two: Then fires when field/operator/
 * value matches the live alert's own vars, Else otherwise — same
 * {user}/{amount}/{message}/{source} vocabulary a Text/Image placeholder
 * already reads (see EVENT_PLACEHOLDERS), not a separate one. Only ever
 * meaningful for a process armed by a real Event (see processTrigger) — one
 * armed purely by Audio Player/Roulette/Random has no such vars, so
 * evaluateCondition always falls to Else in that case, same as a field
 * that's simply absent from this particular alert (e.g. `amount` on a
 * follow). See evaluateCondition/nextProcessNode in pages/overlays/
 * sceneUtils/graph.ts for exactly how a branch gets resolved into the
 * schedule.
 */
export function ConditionNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const { t } = useI18n()
  const field = CONDITION_FIELDS.includes(data.field as (typeof CONDITION_FIELDS)[number]) ? (data.field as (typeof CONDITION_FIELDS)[number]) : 'amount'
  const isNumeric = field === 'amount'
  const isSource = field === 'source'
  const operators = isNumeric ? NUMERIC_CONDITION_OPERATORS : STRING_CONDITION_OPERATORS
  const savedOperator = data.operator as ConditionOperator
  const operator = operators.includes(savedOperator) ? savedOperator : operators[0]
  const value = (data.value as string) ?? ''

  return (
    <BaseNode
      id={id}
      data={data}
      title="Condition"
      category="process"
      sequenceIn
      outputSockets={CONDITION_OUTPUTS}
      help={t.sceneBuilder.tooltip.nodes.condition}
    >
      <Field label="Field">
        <NodeSelect
          value={field}
          options={CONDITION_FIELDS}
          onChange={(next) => {
            const nextOperators = next === 'amount' ? NUMERIC_CONDITION_OPERATORS : STRING_CONDITION_OPERATORS
            updateNodeData(id, { field: next, operator: nextOperators[0], value: '' })
          }}
          renderOption={(opt) => CONDITION_FIELD_LABELS[opt]}
        />
      </Field>
      <Field label="Is">
        <NodeSelect value={operator} options={operators} onChange={(next) => updateNodeData(id, { operator: next })} renderOption={(opt) => CONDITION_OPERATOR_LABELS[opt]} />
      </Field>
      <Field label="Value">
        {isSource ? (
          <NodeSelect
            value={(ALERT_PLATFORMS as readonly string[]).includes(value) ? (value as AlertPlatform) : ALERT_PLATFORMS[0]}
            options={ALERT_PLATFORMS}
            onChange={(next) => updateNodeData(id, { value: next })}
            renderOption={(opt) => ALERT_PLATFORM_LABELS[opt]}
          />
        ) : (
          <input
            type={isNumeric ? 'number' : 'text'}
            value={value}
            onChange={(e) => updateNodeData(id, { value: e.target.value })}
            className={textInputClass}
          />
        )}
      </Field>
    </BaseNode>
  )
}
