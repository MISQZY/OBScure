/** Replaces `{key}` placeholders in a translated string, e.g. interpolate(t.overlayAddress.lanWarning, { host }). */
export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match)
}
