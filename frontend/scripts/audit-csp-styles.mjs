import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const json = process.argv.includes('--json')
const scanRoots = ['app', 'components', 'lib']
const extensions = new Set(['.js', '.jsx', '.ts', '.tsx'])
const debtBudget = {
  filesWithInlineStyleDebt: Number(process.env.KRESCO_CSP_STYLE_FILE_BUDGET ?? 56),
  inlineStyleAttributes: Number(process.env.KRESCO_CSP_INLINE_STYLE_BUDGET ?? 114),
  styleJsxBlocks: Number(process.env.KRESCO_CSP_STYLE_JSX_BUDGET ?? 0),
  dangerouslySetInnerHTML: Number(process.env.KRESCO_CSP_DANGEROUS_HTML_BUDGET ?? 0),
  filesWithCssomStyleWrites: Number(process.env.KRESCO_CSP_CSSOM_FILE_BUDGET ?? 0),
  cssomStyleWrites: Number(process.env.KRESCO_CSP_CSSOM_STYLE_BUDGET ?? 0),
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      walk(path, files)
      continue
    }
    const extension = path.slice(path.lastIndexOf('.'))
    if (extensions.has(extension)) files.push(path)
  }
  return files
}

function lineNumber(content, index) {
  return content.slice(0, index).split('\n').length
}

function countMatches(content, pattern) {
  const matches = []
  for (const match of content.matchAll(pattern)) {
    matches.push(match.index ?? 0)
  }
  return matches
}

function cspDirectives() {
  const proxy = readFileSync(join(root, 'proxy.ts'), 'utf8')
  const directives = {}
  for (const match of proxy.matchAll(/"([^"]+)"/g)) {
    const directive = match[1].trim()
    const [name] = directive.split(/\s+/, 1)
    if (name?.endsWith('-src') || name === 'style-src-elem' || name === 'style-src-attr') {
      directives[name] = directive
    }
  }
  return directives
}

const files = scanRoots.flatMap((dir) => walk(join(root, dir)))
const fileSummaries = []
const cssomSummaries = []
let inlineStyleAttributes = 0
let styleJsxBlocks = 0
let dangerouslySetInnerHTML = 0
let cssomStyleWrites = 0

for (const file of files) {
  const content = readFileSync(file, 'utf8')
  const styleMatches = countMatches(content, /\bstyle\s*=\s*\{/g)
  const styleJsxMatches = countMatches(content, /<style\s+jsx\b/g)
  const dangerousMatches = countMatches(content, /\bdangerouslySetInnerHTML\b/g)
  const cssomMatches = countMatches(content, /\.\s*style\s*\.|\bcssText\b|\bsetAttribute\s*\(\s*['"]style['"]/g)
  const count = styleMatches.length + styleJsxMatches.length + dangerousMatches.length
  const cssomCount = cssomMatches.length

  inlineStyleAttributes += styleMatches.length
  styleJsxBlocks += styleJsxMatches.length
  dangerouslySetInnerHTML += dangerousMatches.length
  cssomStyleWrites += cssomCount
  if (count) {
    fileSummaries.push({
      file: relative(root, file).replaceAll('\\', '/'),
      inlineStyleAttributes: styleMatches.length,
      styleJsxBlocks: styleJsxMatches.length,
      dangerouslySetInnerHTML: dangerousMatches.length,
      firstLines: [
        ...styleMatches,
        ...styleJsxMatches,
        ...dangerousMatches,
      ].sort((a, b) => a - b).slice(0, 3).map((index) => lineNumber(content, index)),
    })
  }
  if (cssomCount) {
    cssomSummaries.push({
      file: relative(root, file).replaceAll('\\', '/'),
      cssomStyleWrites: cssomCount,
      firstLines: cssomMatches.sort((a, b) => a - b).slice(0, 3).map((index) => lineNumber(content, index)),
    })
  }
}

fileSummaries.sort((a, b) => {
  const left = b.inlineStyleAttributes + b.styleJsxBlocks + b.dangerouslySetInnerHTML
  const right = a.inlineStyleAttributes + a.styleJsxBlocks + a.dangerouslySetInnerHTML
  return left - right || a.file.localeCompare(b.file)
})

cssomSummaries.sort((a, b) => b.cssomStyleWrites - a.cssomStyleWrites || a.file.localeCompare(b.file))

const directives = cspDirectives()
const broadStyleSrcAllowsInline = /\bstyle-src\b[^;"]*'unsafe-inline'/.test(directives['style-src'] ?? '')
const result = {
  broadStyleSrcAllowsInline,
  directives: {
    styleSrc: directives['style-src'] ?? '',
    styleSrcElem: directives['style-src-elem'] ?? '',
    styleSrcAttr: directives['style-src-attr'] ?? '',
  },
  budget: debtBudget,
  totals: {
    filesWithInlineStyleDebt: fileSummaries.length,
    inlineStyleAttributes,
    styleJsxBlocks,
    dangerouslySetInnerHTML,
    filesWithCssomStyleWrites: cssomSummaries.length,
    cssomStyleWrites,
  },
  topFiles: fileSummaries.slice(0, 20),
  cssomTopFiles: cssomSummaries.slice(0, 20),
}

if (json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
} else {
  console.log(`broad style-src unsafe-inline: ${broadStyleSrcAllowsInline ? 'yes' : 'no'}`)
  console.log(`style-src: ${result.directives.styleSrc}`)
  console.log(`style-src-elem: ${result.directives.styleSrcElem}`)
  console.log(`style-src-attr: ${result.directives.styleSrcAttr}`)
  console.log(`files with inline style debt: ${result.totals.filesWithInlineStyleDebt}`)
  console.log(`style attributes: ${inlineStyleAttributes}`)
  console.log(`style jsx blocks: ${styleJsxBlocks}`)
  console.log(`dangerouslySetInnerHTML: ${dangerouslySetInnerHTML}`)
  console.log(`files with CSSOM style writes: ${cssomSummaries.length}`)
  console.log(`CSSOM style writes: ${cssomStyleWrites}`)
  console.log('top files:')
  for (const item of result.topFiles.slice(0, 10)) {
    const total = item.inlineStyleAttributes + item.styleJsxBlocks + item.dangerouslySetInnerHTML
    console.log(`- ${item.file}: ${total}`)
  }
}

if (broadStyleSrcAllowsInline) {
  console.error("CSP still allows broad style-src 'unsafe-inline'. Move inline style allowance to style-src-elem/style-src-attr while migration is incomplete.")
  process.exit(1)
}

const budgetFailures = Object.entries(debtBudget).filter(([key, max]) => result.totals[key] > max)
if (budgetFailures.length) {
  for (const [key, max] of budgetFailures) {
    console.error(`CSP style debt budget exceeded for ${key}: ${result.totals[key]} > ${max}. Lower debt or explicitly lower the budget after cleanup.`)
  }
  process.exit(1)
}
