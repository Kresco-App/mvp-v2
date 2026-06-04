const FUNCTIONS: Record<string, (value: number) => number> = {
  abs: Math.abs,
  cos: Math.cos,
  ln: Math.log,
  log: Math.log10,
  sin: Math.sin,
  sqrt: Math.sqrt,
  tan: Math.tan,
}

class MathParser {
  private index = 0

  constructor(private readonly input: string) {}

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
}

export function evaluateMathExpression(expression: string): string {
  try {
    const normalized = expression
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/−/g, '-')
      .replace(/√/g, 'sqrt')
      .replace(/\*\*/g, '^')

    const value = new MathParser(normalized).parse()
    return Number.isInteger(value) ? String(value) : parseFloat(value.toPrecision(12)).toString()
  } catch {
    return 'Erreur'
  }
}
