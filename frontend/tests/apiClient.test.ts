import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { execFileSync } from 'node:child_process'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@/lib/axios', () => ({
  default: mocks,
}))

import { apiJsonClient, clearApiClientInFlightRequests, deleteJson, getJson, patchJson, postJson } from '@/lib/apiClient'

describe('apiClient transport wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearApiClientInFlightRequests()
  })

  it('unwraps data while preserving request config for each HTTP verb', async () => {
    mocks.get.mockResolvedValueOnce({ data: { ok: 'get' } })
    mocks.post.mockResolvedValueOnce({ data: { ok: 'post' } })
    mocks.patch.mockResolvedValueOnce({ data: { ok: 'patch' } })
    mocks.delete.mockResolvedValueOnce({ data: { ok: 'delete' } })

    await expect(getJson('/items', { params: { limit: 1 } })).resolves.toEqual({ ok: 'get' })
    await expect(postJson('/items', { title: 'A' }, { headers: { 'x-test': '1' } })).resolves.toEqual({ ok: 'post' })
    await expect(patchJson('/items/1', { title: 'B' })).resolves.toEqual({ ok: 'patch' })
    await expect(deleteJson('/items/1')).resolves.toEqual({ ok: 'delete' })

    expect(mocks.get).toHaveBeenCalledWith('/items', { params: { limit: 1 } })
    expect(mocks.post).toHaveBeenCalledWith('/items', { title: 'A' }, { headers: { 'x-test': '1' } })
    expect(mocks.patch).toHaveBeenCalledWith('/items/1', { title: 'B' })
    expect(mocks.delete).toHaveBeenCalledWith('/items/1')
  })

  it('offers an axios-shaped adapter without exposing raw transport imports', async () => {
    mocks.get.mockResolvedValueOnce({ data: { ok: 'adapter-get' } })
    mocks.post.mockResolvedValueOnce({ data: { ok: 'adapter-post' } })

    await expect(apiJsonClient.get('/adapter')).resolves.toEqual({ data: { ok: 'adapter-get' } })
    await expect(apiJsonClient.post('/adapter', { plan: 'pro' }, { params: { plan: 'pro' } })).resolves.toEqual({
      data: { ok: 'adapter-post' },
    })

    expect(mocks.get).toHaveBeenCalledWith('/adapter')
    expect(mocks.post).toHaveBeenCalledWith('/adapter', { plan: 'pro' }, { params: { plan: 'pro' } })
  })

  it('deduplicates matching in-flight GET requests', async () => {
    let resolveRequest!: (value: { data: { ok: string } }) => void
    mocks.get.mockReturnValueOnce(new Promise<{ data: { ok: string } }>((resolve) => {
      resolveRequest = resolve
    }))

    const first = getJson('/shared', { params: { limit: 10, subject: 'math' } })
    const second = getJson('/shared', { params: { subject: 'math', limit: 10 } })

    await flushPromises()

    expect(mocks.get).toHaveBeenCalledTimes(1)
    expect(mocks.get).toHaveBeenCalledWith('/shared', { params: { limit: 10, subject: 'math' } })

    resolveRequest({ data: { ok: 'shared' } })

    await expect(Promise.all([first, second])).resolves.toEqual([{ ok: 'shared' }, { ok: 'shared' }])
  })

  it('clears GET dedupe entries after a request settles', async () => {
    mocks.get
      .mockResolvedValueOnce({ data: { ok: 'first' } })
      .mockResolvedValueOnce({ data: { ok: 'second' } })

    await expect(getJson('/repeat')).resolves.toEqual({ ok: 'first' })
    await expect(getJson('/repeat')).resolves.toEqual({ ok: 'second' })

    expect(mocks.get).toHaveBeenCalledTimes(2)
  })

  it('does not deduplicate GET requests with independent cancellation config', async () => {
    const firstController = new AbortController()
    const secondController = new AbortController()
    mocks.get
      .mockResolvedValueOnce({ data: { ok: 'first' } })
      .mockResolvedValueOnce({ data: { ok: 'second' } })

    const first = getJson('/cancellable', { signal: firstController.signal })
    const second = getJson('/cancellable', { signal: secondController.signal })

    await expect(Promise.all([first, second])).resolves.toEqual([{ ok: 'first' }, { ok: 'second' }])
    expect(mocks.get).toHaveBeenCalledTimes(2)
  })

  it('keeps high-traffic shared surfaces off direct axios imports', () => {
    for (const pathname of [
      ['lib', 'apiData.ts'],
      ['lib', 'authPageController.ts'],
      ['lib', 'examData.ts'],
      ['components', 'Leaderboard.tsx'],
      ['components', 'VideoPlayer.tsx'],
      ['components', 'topic-workspace', 'TopicWorkspacePanels.tsx'],
      ['app', '(dashboard)', 'topics', '[topicId]', 'page.tsx'],
    ]) {
      const source = readFileSync(join(process.cwd(), ...pathname), 'utf8')
      expect(source, pathname.join('/')).not.toMatch(/from ['"]@\/lib\/axios['"]/)
  }
})

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}

  it('keeps production frontend code behind the shared API client abstraction', () => {
    const frontendRoot = process.cwd()
    const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'frontend'], {
      cwd: join(frontendRoot, '..'),
      encoding: 'utf8',
    })
      .split(/\r?\n/)
      .filter((file) => file && /\.(ts|tsx)$/.test(file))
      .filter((file) => !file.startsWith('frontend/tests/'))
      .filter((file) => file !== 'frontend/lib/apiClient.ts')
      .filter((file) => existsSync(join(frontendRoot, '..', file)))

    for (const file of files) {
      const absolutePath = join(frontendRoot, '..', file)
      const source = readFileSync(absolutePath, 'utf8')
      expect(source, relative(frontendRoot, absolutePath)).not.toMatch(/from ['"](?:@\/lib\/axios|\.\/axios)['"]/)
    }
  })
})
