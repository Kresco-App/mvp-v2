import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import nextConfig from '../next.config.mjs'

const root = process.cwd()
const json = process.argv.includes('--json')
const scanRoots = ['app', 'components', 'lib']
const extensions = new Set(['.js', '.jsx', '.ts', '.tsx'])
const debtBudget = {
  filesWithInlineStyleDebt: Number(process.env.KRESCO_CSP_STYLE_FILE_BUDGET ?? 0),
  inlineStyleAttributes: Number(process.env.KRESCO_CSP_INLINE_STYLE_BUDGET ?? 0),
  styleJsxBlocks: Number(process.env.KRESCO_CSP_STYLE_JSX_BUDGET ?? 0),
  dangerouslySetInnerHTML: Number(process.env.KRESCO_CSP_DANGEROUS_HTML_BUDGET ?? 0),
  filesWithCssomStyleWrites: Number(process.env.KRESCO_CSP_CSSOM_FILE_BUDGET ?? 0),
  cssomStyleWrites: Number(process.env.KRESCO_CSP_CSSOM_STYLE_BUDGET ?? 0),
  filesWithDynamicStyleInjection: Number(process.env.KRESCO_CSP_DYNAMIC_STYLE_FILE_BUDGET ?? 0),
  dynamicStyleTagCreations: Number(process.env.KRESCO_CSP_DYNAMIC_STYLE_TAG_BUDGET ?? 0),
  dynamicStyleContentWrites: Number(process.env.KRESCO_CSP_DYNAMIC_STYLE_CONTENT_BUDGET ?? 0),
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function dynamicStyleInjectionMatches(content) {
  const styleTagCreations = countMatches(
    content,
    /\bdocument\s*\.\s*createElement\s*\(\s*['"]style['"]\s*\)/g,
  )
  const styleNodeNames = new Set()
  const styleNodeAssignmentPattern =
    /(?:\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*|\b([A-Za-z_$][\w$]*)\s*=\s*)document\s*\.\s*createElement\s*\(\s*['"]style['"]\s*\)/g

  for (const match of content.matchAll(styleNodeAssignmentPattern)) {
    const name = match[1] ?? match[2]
    if (name) styleNodeNames.add(name)
  }

  const styleContentWriteIndexes = []
  const directStyleContentWritePattern =
    /\bdocument\s*\.\s*createElement\s*\(\s*['"]style['"]\s*\)\s*\.\s*(?:innerHTML|textContent)\s*=/g

  for (const match of content.matchAll(directStyleContentWritePattern)) {
    styleContentWriteIndexes.push(match.index ?? 0)
  }

  for (const name of styleNodeNames) {
    const escapedName = escapeRegExp(name)
    const propertyWritePattern = new RegExp(`\\b${escapedName}\\s*\\.\\s*(?:innerHTML|textContent)\\s*=`, 'g')
    const bracketWritePattern = new RegExp(`\\b${escapedName}\\s*\\[\\s*['"](?:innerHTML|textContent)['"]\\s*\\]\\s*=`, 'g')
    styleContentWriteIndexes.push(...countMatches(content, propertyWritePattern))
    styleContentWriteIndexes.push(...countMatches(content, bracketWritePattern))
  }

  return {
    styleTagCreations,
    styleContentWrites: [...new Set(styleContentWriteIndexes)],
  }
}

function directiveMapFromStrings(strings) {
  const directives = {}
  for (const value of strings) {
    for (const directive of value.split(';')) {
      const trimmed = directive.trim()
      const [name] = trimmed.split(/\s+/, 1)
      if (name) directives[name] = trimmed
    }
  }
  return directives
}

function proxyCspDirectives() {
  const proxy = readFileSync(join(root, 'proxy.ts'), 'utf8')
  const directives = []
  for (const match of proxy.matchAll(/"([^"]+)"/g)) {
    const directive = match[1].trim()
    const [name] = directive.split(/\s+/, 1)
    if (name?.endsWith('-src') || name === 'style-src-elem' || name === 'style-src-attr') {
      directives.push(directive)
    }
  }
  return directiveMapFromStrings(directives)
}

async function nextConfigCspAudit() {
  if (typeof nextConfig.headers !== 'function') {
    return {
      emitsContentSecurityPolicy: false,
      contentSecurityPolicyCount: 0,
      scriptSrcAllowsUnsafeInline: false,
      styleSrcAllowsUnsafeInline: false,
    }
  }

  const headerGroups = await nextConfig.headers()
  const cspValues = headerGroups
    .flatMap((group) => group.headers ?? [])
    .filter((header) => header?.key?.toLowerCase() === 'content-security-policy')
    .map((header) => String(header.value ?? ''))

  return {
    emitsContentSecurityPolicy: cspValues.length > 0,
    contentSecurityPolicyCount: cspValues.length,
    scriptSrcAllowsUnsafeInline: cspValues.some((value) => /\bscript-src\b[^;"]*'unsafe-inline'/.test(value)),
    styleSrcAllowsUnsafeInline: cspValues.some((value) => /\bstyle-src\b[^;"]*'unsafe-inline'/.test(value)),
  }
}

const files = scanRoots.flatMap((dir) => walk(join(root, dir)))
const fileSummaries = []
const cssomSummaries = []
const dynamicStyleSummaries = []
let inlineStyleAttributes = 0
let styleJsxBlocks = 0
let dangerouslySetInnerHTML = 0
let cssomStyleWrites = 0
let dynamicStyleTagCreations = 0
let dynamicStyleContentWrites = 0

for (const file of files) {
  const content = readFileSync(file, 'utf8')
  const styleMatches = countMatches(content, /\bstyle\s*=\s*\{/g)
  const styleJsxMatches = countMatches(content, /<style\s+jsx\b/g)
  const dangerousMatches = countMatches(content, /\bdangerouslySetInnerHTML\b/g)
  const cssomMatches = countMatches(content, /\.\s*style\s*\.|\bcssText\b|\bsetAttribute\s*\(\s*['"]style['"]/g)
  const dynamicStyleMatches = dynamicStyleInjectionMatches(content)
  const count = styleMatches.length + styleJsxMatches.length + dangerousMatches.length
  const cssomCount = cssomMatches.length
  const dynamicStyleCount = dynamicStyleMatches.styleTagCreations.length + dynamicStyleMatches.styleContentWrites.length

  inlineStyleAttributes += styleMatches.length
  styleJsxBlocks += styleJsxMatches.length
  dangerouslySetInnerHTML += dangerousMatches.length
  cssomStyleWrites += cssomCount
  dynamicStyleTagCreations += dynamicStyleMatches.styleTagCreations.length
  dynamicStyleContentWrites += dynamicStyleMatches.styleContentWrites.length
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
  if (dynamicStyleCount) {
    dynamicStyleSummaries.push({
      file: relative(root, file).replaceAll('\\', '/'),
      dynamicStyleTagCreations: dynamicStyleMatches.styleTagCreations.length,
      dynamicStyleContentWrites: dynamicStyleMatches.styleContentWrites.length,
      firstLines: [
        ...dynamicStyleMatches.styleTagCreations,
        ...dynamicStyleMatches.styleContentWrites,
      ].sort((a, b) => a - b).slice(0, 3).map((index) => lineNumber(content, index)),
    })
  }
}

fileSummaries.sort((a, b) => {
  const left = b.inlineStyleAttributes + b.styleJsxBlocks + b.dangerouslySetInnerHTML
  const right = a.inlineStyleAttributes + a.styleJsxBlocks + a.dangerouslySetInnerHTML
  return left - right || a.file.localeCompare(b.file)
})

cssomSummaries.sort((a, b) => b.cssomStyleWrites - a.cssomStyleWrites || a.file.localeCompare(b.file))

dynamicStyleSummaries.sort((a, b) => {
  const left = b.dynamicStyleTagCreations + b.dynamicStyleContentWrites
  const right = a.dynamicStyleTagCreations + a.dynamicStyleContentWrites
  return left - right || a.file.localeCompare(b.file)
})

const directives = proxyCspDirectives()
const broadStyleSrcAllowsInline = /\bstyle-src\b[^;"]*'unsafe-inline'/.test(directives['style-src'] ?? '')
const styleSrcElemAllowsInline = /\bstyle-src-elem\b[^;"]*'unsafe-inline'/.test(directives['style-src-elem'] ?? '')
const styleSrcAttrAllowsInline = /\bstyle-src-attr\b[^;"]*'unsafe-inline'/.test(directives['style-src-attr'] ?? '')
const nextConfigAudit = await nextConfigCspAudit()
const result = {
  broadStyleSrcAllowsInline,
  styleSrcElemAllowsInline,
  styleSrcAttrAllowsInline,
  directives: {
    styleSrc: directives['style-src'] ?? '',
    styleSrcElem: directives['style-src-elem'] ?? '',
    styleSrcAttr: directives['style-src-attr'] ?? '',
  },
  nextConfig: nextConfigAudit,
  budget: debtBudget,
  totals: {
    filesWithInlineStyleDebt: fileSummaries.length,
    inlineStyleAttributes,
    styleJsxBlocks,
    dangerouslySetInnerHTML,
    filesWithCssomStyleWrites: cssomSummaries.length,
    cssomStyleWrites,
    filesWithDynamicStyleInjection: dynamicStyleSummaries.length,
    dynamicStyleTagCreations,
    dynamicStyleContentWrites,
  },
  topFiles: fileSummaries.slice(0, 20),
  cssomTopFiles: cssomSummaries.slice(0, 20),
  dynamicStyleTopFiles: dynamicStyleSummaries.slice(0, 20),
}

if (json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
} else {
  console.log(`next.config emits CSP: ${nextConfigAudit.emitsContentSecurityPolicy ? 'yes' : 'no'}`)
  if (nextConfigAudit.emitsContentSecurityPolicy) {
    console.log(`next.config script-src unsafe-inline: ${nextConfigAudit.scriptSrcAllowsUnsafeInline ? 'yes' : 'no'}`)
    console.log(`next.config style-src unsafe-inline: ${nextConfigAudit.styleSrcAllowsUnsafeInline ? 'yes' : 'no'}`)
  }
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
  console.log(`files with dynamic style injection: ${dynamicStyleSummaries.length}`)
  console.log(`dynamic style tag creations: ${dynamicStyleTagCreations}`)
  console.log(`dynamic style content writes: ${dynamicStyleContentWrites}`)
  console.log('top files:')
  for (const item of result.topFiles.slice(0, 10)) {
    const total = item.inlineStyleAttributes + item.styleJsxBlocks + item.dangerouslySetInnerHTML
    console.log(`- ${item.file}: ${total}`)
  }
}

if (nextConfigAudit.emitsContentSecurityPolicy) {
  const inlineAllowances = [
    nextConfigAudit.scriptSrcAllowsUnsafeInline ? "script-src 'unsafe-inline'" : '',
    nextConfigAudit.styleSrcAllowsUnsafeInline ? "style-src 'unsafe-inline'" : '',
  ].filter(Boolean)
  const suffix = inlineAllowances.length
    ? ` Detected ${inlineAllowances.join(' and ')} in next.config.mjs.`
    : ''
  console.error(`next.config.mjs must not emit a global Content-Security-Policy header; proxy.ts owns the stricter page CSP.${suffix}`)
  process.exit(1)
}

if (broadStyleSrcAllowsInline) {
  console.error("CSP still allows broad style-src 'unsafe-inline'. Move inline style allowance to style-src-elem/style-src-attr while migration is incomplete.")
  process.exit(1)
}

if (styleSrcElemAllowsInline || styleSrcAttrAllowsInline) {
  const unsafeDirectives = [
    styleSrcElemAllowsInline ? 'style-src-elem' : '',
    styleSrcAttrAllowsInline ? 'style-src-attr' : '',
  ].filter(Boolean).join(' and ')
  console.error(`CSP still allows ${unsafeDirectives} 'unsafe-inline'. Remove temporary inline style allowances after source cleanup.`)
  process.exit(1)
}

const budgetFailures = Object.entries(debtBudget).filter(([key, max]) => result.totals[key] > max)
if (budgetFailures.length) {
  for (const [key, max] of budgetFailures) {
    console.error(`CSP style debt budget exceeded for ${key}: ${result.totals[key]} > ${max}. Lower debt or explicitly lower the budget after cleanup.`)
  }
  process.exit(1)
}
