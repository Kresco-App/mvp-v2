import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const standaloneRoot = join(root, '.next', 'standalone')
const staticSource = join(root, '.next', 'static')
const staticTarget = join(standaloneRoot, '.next', 'static')
const publicSource = join(root, 'public')
const publicTarget = join(standaloneRoot, 'public')

if (!existsSync(standaloneRoot)) {
  throw new Error('Missing .next/standalone. Run `next build` before starting the standalone server.')
}

if (!existsSync(staticSource)) {
  throw new Error('Missing .next/static. Run `next build` before starting the standalone server.')
}

mkdirSync(join(standaloneRoot, '.next'), { recursive: true })
rmSync(staticTarget, { recursive: true, force: true })
cpSync(staticSource, staticTarget, { recursive: true })

if (existsSync(publicSource)) {
  rmSync(publicTarget, { recursive: true, force: true })
  cpSync(publicSource, publicTarget, { recursive: true })
}
