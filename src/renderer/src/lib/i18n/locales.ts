export type LocaleId = 'ru' | 'en'

export interface LocaleDefinition {
  id: LocaleId
  label: string
  shortLabel: string
}

export const LOCALES: LocaleDefinition[] = [
  { id: 'ru', label: 'Русский', shortLabel: 'RU' },
  { id: 'en', label: 'English', shortLabel: 'EN' }
]
