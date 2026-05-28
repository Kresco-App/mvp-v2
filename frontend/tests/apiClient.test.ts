import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { execFileSync } from 'node:child_process'

import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@/lib/axios', () => ({
  default: mocks,
}))

import { apiJsonClient, deleteJson, getJson, patchJson, postJson } from '@/lib/apiClient'

describe('apiClient transport wrapper', () => {
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

  it('offers an axios-shaped compatibility adapter without exposing raw transport imports', async () => {
    mocks.get.mockResolvedValueOnce({ data: { ok: 'adapter-get' } })
    mocks.post.mockResolvedValueOnce({ data: { ok: 'adapter-post' } })

    await expect(apiJsonClient.get('/adapter')).resolves.toEqual({ data: { ok: 'adapter-get' } })
    await expect(apiJsonClient.post('/adapter', { plan: 'pro' }, { params: { plan: 'pro' } })).resolves.toEqual({
      data: { ok: 'adapter-post' },
    })

    expect(mocks.get).toHaveBeenCalledWith('/adapter')
    expect(mocks.post).toHaveBeenCalledWith('/adapter', { plan: 'pro' }, { params: { plan: 'pro' } })
  })

  it('keeps high-traffic shared surfaces off direct axios imports', () => {
    for (const pathname of [
      ['lib', 'apiData.ts'],
      ['lib', 'authPageController.ts'],
      ['lib', 'examData.ts'],
      ['lib', 'subjectProgress.ts'],
      ['components', 'Leaderboard.tsx'],
      ['components', 'VideoPlayer.tsx'],
      ['components', 'VideoQuizOverlay.tsx'],
      ['components', 'topic-workspace', 'TopicWorkspacePanels.tsx'],
      ['app', '(dashboard)', 'topics', '[topicId]', 'page.tsx'],
    ]) {
      const source = readFileSync(join(process.cwd(), ...pathname), 'utf8')
      expect(source, pathname.join('/')).not.toMatch(/from ['"]@\/lib\/axios['"]/)
    }
  })

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
