export function isActiveNavHref(
  pathname: string,
  href: string | null | undefined,
  exactMatchHrefs: readonly string[] = [],
) {
  if (!href) return false
  if (exactMatchHrefs.includes(href)) return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}
