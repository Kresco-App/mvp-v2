import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

describe('animated source-port context providers', () => {
  it('does not pass fresh object literals to Provider value props', () => {
    const files = findContextFiles(path.join(process.cwd(), 'components', 'animated', 'source-ports'))
    const offenders = files.filter((file) => (
      /Provider\s+value=\{\s*\{/.test(readFileSync(file, 'utf-8'))
    ))

    expect(offenders.map((file) => path.relative(process.cwd(), file).replaceAll(path.sep, '/'))).toEqual([])
  })
})

function findContextFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = path.join(directory, entry)
    if (statSync(fullPath).isDirectory()) return findContextFiles(fullPath)
    return /context[/\\].*Context\.tsx$/.test(fullPath) ? [fullPath] : []
  })
}
