export function normalizeOptionKey(value: unknown) {
  return String(value ?? '')
}

export function splitOrderingInput(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

export function toggleMultiAnswer(current: unknown, option: string) {
  const values = Array.isArray(current) ? current.map(String) : []
  return values.includes(option) ? values.filter((value) => value !== option) : [...values, option]
}
