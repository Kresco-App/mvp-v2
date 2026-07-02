const FUNCTIONS: Record<string, (value: number) => number> = {
  abs: Math.abs,
  acos: Math.acos,
  asin: Math.asin,
  atan: Math.atan,
  cos: Math.cos,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  sin: Math.sin,
  sqrt: Math.sqrt,
  tan: Math.tan,
}

export type LimitDirection = 'both' | 'left' | 'right'

class MathParser {
  private index = 0

  constructor(
    private readonly input: string,
    private readonly variables: Record<string, number> = {},
  ) {}

  parse() {
    const value = this.expression()
    this.skipWhitespace()
    if (this.index < this.input.length) throw new Error('Unexpected input')
    if (!Number.isFinite(value)) throw new Error('Invalid result')
    return value
  }

  private expression(): number {
    let value = this.term()
    while (true) {
      this.skipWhitespace()
      if (this.consume('+')) value += this.term()
      else if (this.consume('-')) value -= this.term()
      else return value
    }
  }

  private term(): number {
    let value = this.power()
    while (true) {
      this.skipWhitespace()
      if (this.consume('*')) value *= this.power()
      else if (this.consume('/')) value /= this.power()
      else if (this.consume('%')) value %= this.power()
      else if (this.shouldImplicitlyMultiply()) value *= this.power()
      else return value
    }
  }

  private power(): number {
    const values = [this.unary()]
    while (true) {
      this.skipWhitespace()
      if (!this.consume('^')) break
      values.push(this.unary())
    }

    let value = values[values.length - 1]
    for (let index = values.length - 2; index >= 0; index -= 1) {
      value = Math.pow(values[index], value)
    }
    return value
  }

  private unary(): number {
    this.skipWhitespace()
    if (this.consume('+')) return this.unary()
    if (this.consume('-')) return -this.unary()
    return this.primary()
  }

  private primary(): number {
    this.skipWhitespace()

    if (this.consume('(')) {
      const value = this.expression()
      if (!this.consume(')')) throw new Error('Missing closing parenthesis')
      return value
    }

    const word = this.readWord()
    if (word) {
      const lower = word.toLowerCase()
      if (lower === 'pi') return Math.PI
      if (lower === 'e') return Math.E
      if (lower in this.variables) return this.variables[lower]

      const fn = FUNCTIONS[lower]
      if (!fn) throw new Error('Unknown function')
      this.skipWhitespace()
      if (!this.consume('(')) throw new Error('Function requires parentheses')
      const value = this.expression()
      if (!this.consume(')')) throw new Error('Missing closing parenthesis')
      return fn(value)
    }

    return this.number()
  }

  private number(): number {
    this.skipWhitespace()
    const start = this.index

    while (/[0-9.]/.test(this.input[this.index] ?? '')) this.index += 1
    if (/[eE]/.test(this.input[this.index] ?? '')) {
      this.index += 1
      if (/[+-]/.test(this.input[this.index] ?? '')) this.index += 1
      while (/[0-9]/.test(this.input[this.index] ?? '')) this.index += 1
    }

    if (start === this.index) throw new Error('Expected number')
    const value = Number(this.input.slice(start, this.index))
    if (!Number.isFinite(value)) throw new Error('Invalid number')
    return value
  }

  private readWord() {
    this.skipWhitespace()
    const start = this.index
    while (/[a-zA-Z]/.test(this.input[this.index] ?? '')) this.index += 1
    return this.input.slice(start, this.index)
  }

  private consume(char: string) {
    this.skipWhitespace()
    if (this.input[this.index] !== char) return false
    this.index += 1
    return true
  }

  private skipWhitespace() {
    while (/\s/.test(this.input[this.index] ?? '')) this.index += 1
  }

  private shouldImplicitlyMultiply() {
    this.skipWhitespace()
    const next = this.input[this.index] ?? ''
    return next === '(' || /[a-zA-Z]/.test(next)
  }
}

export function normalizeMathExpression(expression: string) {
  return expression
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/√/g, 'sqrt')
    .replace(/\*\*/g, '^')
    .replace(/\bπ\b/g, 'pi')
}

export function completeMathExpression(expression: string) {
  const normalized = normalizeMathExpression(expression)
  let depth = 0

  for (const char of normalized) {
    if (char === '(') depth += 1
    else if (char === ')') depth = Math.max(0, depth - 1)
  }

  return `${normalized}${')'.repeat(depth)}`
}

export function evaluateMathNumber(expression: string, variables: Record<string, number> = {}) {
  const normalized = completeMathExpression(expression)
  return new MathParser(normalized, normalizeVariables(variables)).parse()
}

export function evaluateMathExpression(expression: string, variables: Record<string, number> = {}): string {
  try {
    return formatMathResult(evaluateMathNumber(expression, variables))
  } catch {
    return 'Erreur'
  }
}

export function approximateLimit(
  expression: string,
  targetValue: number,
  direction: LimitDirection = 'both',
) {
  const samples = targetValue === Infinity || targetValue === -Infinity
    ? infinitySamples(targetValue)
    : finiteSamples(targetValue, direction)

  const values = samples
    .map((x) => safeEvaluate(expression, { x }))
    .filter((value): value is number => value !== null)

  if (values.length < 2) return null
  const recent = values.slice(-4)
  const last = recent[recent.length - 1]
  const maxDelta = Math.max(...recent.slice(0, -1).map((value) => Math.abs(value - last)))

  if (Math.abs(last) > 1e8 && recent.every((value) => Math.sign(value) === Math.sign(last))) {
    return last > 0 ? Infinity : -Infinity
  }

  if (maxDelta > Math.max(0.05, Math.abs(last) * 0.08)) return null
  return last
}

export function expressionToLatex(expression: string): string {
  const normalized = completeMathExpression(expression.trim())
  if (!normalized) return '0'
  return latexForExpression(stripOuterParens(normalized))
}

export function formatMathResult(value: number) {
  if (!Number.isFinite(value)) return value > 0 ? '+∞' : '-∞'
  if (Math.abs(value) < 1e-10) return '0'
  return Number.isInteger(value) ? String(value) : parseFloat(value.toPrecision(12)).toString()
}

function safeEvaluate(expression: string, variables: Record<string, number>) {
  try {
    const value = evaluateMathNumber(expression, variables)
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

function normalizeVariables(variables: Record<string, number>) {
  return Object.fromEntries(Object.entries(variables).map(([key, value]) => [key.toLowerCase(), value]))
}

function finiteSamples(targetValue: number, direction: LimitDirection) {
  const steps = [1e-1, 1e-2, 1e-3, 1e-4, 1e-5]
  if (direction === 'left') return steps.map((step) => targetValue - step)
  if (direction === 'right') return steps.map((step) => targetValue + step)
  return steps.flatMap((step) => [targetValue - step, targetValue + step])
}

function infinitySamples(targetValue: number) {
  const sign = targetValue < 0 ? -1 : 1
  return [100, 500, 1000, 5000, 10000].map((value) => value * sign)
}

function latexForExpression(expression: string): string {
  const value = stripOuterParens(expression.trim())
  if (!value) return '\\,'
  const division = splitTopLevel(value, '/')
  if (division) {
    return `\\frac{${latexForExpression(division.left)}}{${latexForExpression(division.right)}}`
  }

  const addition = splitTopLevel(value, '+')
  if (addition) return `${latexForExpression(addition.left)} + ${latexForExpression(addition.right)}`

  const subtraction = splitTopLevel(value, '-')
  if (subtraction) return `${latexForExpression(subtraction.left)} - ${latexForExpression(subtraction.right)}`

  const multiplication = splitTopLevel(value, '*')
  if (multiplication) return `${latexForExpression(multiplication.left)}\\cdot ${latexForExpression(multiplication.right)}`

  const power = splitTopLevel(value, '^')
  if (power) return `{${latexForExpression(power.left)}}^{${latexForExpression(power.right)}}`

  const partialFnMatch = /^([a-zA-Z]+)\((.*)$/.exec(value)
  if (partialFnMatch && !value.endsWith(')')) {
    const [, fn, inner] = partialFnMatch
    const normalizedFn = fn.toLowerCase()
    const innerLatex = inner.trim() ? latexForExpression(inner) : '\\,'
    if (normalizedFn === 'sqrt') return `\\sqrt{${innerLatex}}`
    if (normalizedFn === 'abs') return `\\left|${innerLatex}\\right|`
    if (normalizedFn === 'sin' || normalizedFn === 'cos' || normalizedFn === 'tan' || normalizedFn === 'ln' || normalizedFn === 'log') {
      return `\\${normalizedFn}\\left(${innerLatex}\\right.`
    }
  }

  const fnMatch = /^([a-zA-Z]+)\((.*)\)$/.exec(value)
  if (fnMatch) {
    const [, fn, inner] = fnMatch
    const normalizedFn = fn.toLowerCase()
    if (normalizedFn === 'sqrt') return `\\sqrt{${latexForExpression(inner)}}`
    if (normalizedFn === 'abs') return `\\left|${latexForExpression(inner)}\\right|`
    const label = normalizedFn === 'ln' || normalizedFn === 'log' ? `\\${normalizedFn}` : `\\${normalizedFn}`
    return `${label}\\left(${latexForExpression(inner)}\\right)`
  }

  if (value.toLowerCase() === 'pi') return '\\pi'
  if (value.toLowerCase() === 'infinity') return '\\infty'
  return value.replace(/\*/g, '\\cdot ')
}

function splitTopLevel(expression: string, operator: string) {
  let depth = 0
  for (let index = expression.length - 1; index >= 0; index -= 1) {
    const char = expression[index]
    if (char === ')') depth += 1
    else if (char === '(') depth -= 1
    else if (char === operator && depth === 0) {
      if (operator === '-' && (index === 0 || '+-*/^('.includes(expression[index - 1] ?? ''))) continue
      return {
        left: expression.slice(0, index),
        right: expression.slice(index + 1),
      }
    }
  }
  return null
}

function stripOuterParens(expression: string): string {
  let value = expression.trim()
  while (value.startsWith('(') && value.endsWith(')') && wrapsWholeExpression(value)) {
    value = value.slice(1, -1).trim()
  }
  return value
}

function wrapsWholeExpression(expression: string) {
  let depth = 0
  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index]
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (depth === 0 && index < expression.length - 1) return false
  }
  return depth === 0
}
