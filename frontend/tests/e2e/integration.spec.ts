import { expect, test, type Page } from '@playwright/test'
import { authenticateSeededUser, loginAsSeededUser } from './auth'

const frontendPort = Number(process.env.KRESCO_E2E_FRONTEND_PORT ?? 3101)
const backendPort = Number(process.env.KRESCO_E2E_BACKEND_PORT ?? 8010)
const frontendOrigin = `http://127.0.0.1:${frontendPort}`
const backendOrigin = `http://127.0.0.1:${backendPort}`
const authCookieNames = ['__session', 'kresco_user_role', 'kresco_csrf']

type TopicSummary = {
  id: number
  title: string
  item_count: number
  completed_count: number
  progress_pct: number
  can_access?: boolean
}

type TopicWorkspace = {
  subject_title: string
  item_count: number
  completed_count: number
  active_item: {
    id: number
    title: string
    progress_status?: string
  } | null
}

type SubjectSummary = {
  id: number
  title: string
}


type CourseOffering = {
  id: number
  title: string
  track: {
    niveau: string
    filiere: string
  }
}

type ProfessorLiveSession = {
  id: number
  course_offering_id: number
  title: string
  status: string
}

type StudentLiveSession = {
  id: number
  title: string
  status: string
  can_join: boolean
}

type LiveSessionCheckpoint = {
  id: number
  title: string
  status: string
}

type LiveSessionInteraction = {
  id: number
  body: string
  status: string
  kind: string
}

type ProfileMediaResponse = {
  url: string
}

type ProfessorChatImageMessage = {
  body: string
  attachment_url: string
  attachment_mime_type: string
  attachment_name: string
  attachment_size: number
}



async function firstSeededSubject(page: Page) {
  const subjectsResponse = await page.request.get(apiUrl('/api/courses/subjects'))
  expect(subjectsResponse.status()).toBe(200)
  const subjects = await subjectsResponse.json() as SubjectSummary[]
  const subject = subjects[0]
  expect(subject, 'expected seeded backend database to include at least one subject').toBeTruthy()
  return subject
}

async function firstAccessibleTopic(page: Page) {
  const topicsResponse = await page.request.get(apiUrl('/api/courses/topics'))
  expect(topicsResponse.status()).toBe(200)
  const topics = await topicsResponse.json() as TopicSummary[]
  const topic = topics.find((item) => item.can_access !== false && item.item_count > 0) ?? topics[0]
  expect(topic, 'expected seeded backend database to include at least one topic').toBeTruthy()
  return topic
}

async function loginViaBackend(page: Page, email: string) {
  return authenticateSeededUser(page, email)
}

function responsePath(response: { url(): string }) {
  return new URL(response.url()).pathname
}

function apiUrl(path: string) {
  return `${backendOrigin}${path}`
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function unsignedJwt(payload: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.test`
}

function pngUpload(name: string) {
  return {
    name,
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
      'base64',
    ),
  }
}

function expectMockGcsMediaUrl(value: string, expectedPathSegment: string) {
  expect(value).toContain('https://mock-gcs.local/kresco-e2e-media/e2e/')
  expect(value).toContain(expectedPathSegment)
  expect(value).toContain('signature=mock')
  expect(value).not.toContain('/media/')
}

async function failWithPageState(page: Page, message: string, error: unknown, clientErrors: string[] = []) {
  const state = await page.evaluate(() => ({
    url: window.location.href,
    bodyText: document.body.innerText.slice(0, 2000),
    storedUser: window.localStorage.getItem('kresco_user'),
    storedCsrf: window.sessionStorage.getItem('kresco_csrf'),
    cookies: document.cookie,
  }))

  throw new Error(`${message}\n${JSON.stringify({ ...state, clientErrors }, null, 2)}\n${String(error)}`)
}

async function csrfRequestHeaders(page: Page) {
  const token = await page.evaluate(() => {
    const stored = window.sessionStorage.getItem('kresco_csrf')
    if (stored) return stored

    const cookie = document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('kresco_csrf='))
    return cookie ? decodeURIComponent(cookie.slice('kresco_csrf='.length)) : ''
  })

  if (!token) {
    throw new Error('expected authenticated browser context to expose a CSRF token')
  }

  return {
    origin: frontendOrigin,
    referer: `${frontendOrigin}/`,
    'x-csrf-token': token,
  }
}



test('local demo login backdoor is not exposed', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Bienvenue sur Kresco/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Local demo login/i })).toHaveCount(0)

  const response = await page.request.post(apiUrl('/api/auth/demo-login'))
  expect(response.status()).toBe(404)

  const storedToken = await page.evaluate(() => localStorage.getItem('kresco_token'))
  expect(storedToken).toBeNull()
})

test('backend-backed student journey reaches topic progress', async ({ page }) => {
  const clientErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') clientErrors.push(message.text())
  })
  page.on('pageerror', (error) => {
    clientErrors.push(error.message)
  })
  const topicsResponse = page.waitForResponse((response) => (
    responsePath(response) === '/api/courses/topics'
      && response.request().method() === 'GET'
  ))

  await loginAsSeededUser(page, 'student@example.com')
  await expect(page).toHaveURL(/\/home$/)
  await expect(page.getByRole('heading', { name: /Hello Kresco!/i })).toBeVisible().catch((error) => (
    failWithPageState(page, 'Home did not render after backend login.', error, clientErrors)
  ))
  await expect(page.getByText('Wanna complete where we left off last time?')).toBeVisible()

  const topics = await (await topicsResponse).json() as TopicSummary[]
  const topic = topics.find((item) => item.title === 'E2E Watch Flow') ?? topics.find((item) => (
    item.can_access !== false
      && item.item_count > 0
      && item.completed_count < item.item_count
      && item.progress_pct > 0
      && item.progress_pct < 100
  )) ?? topics.find((item) => item.can_access !== false && item.item_count > 0 && item.completed_count < item.item_count)

  if (!topic) {
    throw new Error('expected seeded student to have an accessible incomplete topic')
  }

  const workspaceResponse = page.waitForResponse((response) => (
    responsePath(response) === `/api/courses/topics/${topic.id}/workspace`
      && response.request().method() === 'GET'
  ))
  await page.goto(`/topics/${topic.id}`)

  const workspace = await (await workspaceResponse).json() as TopicWorkspace
  const activeItem = workspace.active_item
  if (!activeItem) {
    throw new Error('expected topic workspace to expose an active item')
  }
  await expect(page).toHaveURL(new RegExp(`/topics/${topic.id}`))
  await expect(page.getByRole('heading', { name: new RegExp(escapeRegExp(`${workspace.subject_title}: ${activeItem.title}`), 'i') })).toBeVisible().catch((error) => (
    failWithPageState(page, 'Topic workspace did not render after backend route load.', error, clientErrors)
  ))

  const completeResponse = page.waitForResponse((response) => (
    responsePath(response) === `/api/courses/topic-items/${activeItem.id}/complete`
      && response.request().method() === 'POST'
  ))
  const refreshedWorkspaceResponse = page.waitForResponse((response) => (
    responsePath(response) === `/api/courses/topics/${topic.id}/workspace`
      && response.request().method() === 'GET'
      && response.url().includes(`item_id=${activeItem.id}`)
  ))
  await page.getByRole('button', { name: /Mark complete/i }).click()

  const complete = await completeResponse
  expect(complete.status()).toBe(200)
  const refreshedWorkspace = await (await refreshedWorkspaceResponse).json() as TopicWorkspace
  expect(refreshedWorkspace.completed_count).toBeGreaterThanOrEqual(workspace.completed_count)
  expect(refreshedWorkspace.active_item?.id).toBe(activeItem.id)
  expect(refreshedWorkspace.active_item?.progress_status).toBe('completed')
  await expect(page.getByLabel('Course content')).toContainText(`${refreshedWorkspace.completed_count}/${refreshedWorkspace.item_count} Completed`)

})

test('backend-backed VIP student chat sends a real professor message', async ({ page }) => {
  await loginAsSeededUser(page, 'vip@example.com')
  await page.goto('/professor-chat')

  await expect(page.getByRole('heading', { name: /Pr Ahmed Kamil/i })).toBeVisible()
  await expect(page.locator('p').filter({ hasText: 'Can you review my final proof step?' }).first()).toBeVisible()

  const message = `Backend-backed Playwright chat ${Date.now()}`
  await page.getByLabel('Message your professor').fill(message)
  const sendResponse = page.waitForResponse((response) => (
    /\/api\/professor\/student-chat\/conversations\/\d+\/messages$/.test(responsePath(response))
      && response.request().method() === 'POST'
  ))
  await page.getByRole('button', { name: 'Send message' }).click()

  const response = await sendResponse
  expect(response.status()).toBe(201)
  await expect(page.getByText(message, { exact: true })).toBeVisible()
})

test('backend-backed upload flows use GCS mock storage for profile and chat media', async ({ browser }) => {
  const studentContext = await browser.newContext({ baseURL: frontendOrigin })
  const professorContext = await browser.newContext({ baseURL: frontendOrigin })
  const studentPage = await studentContext.newPage()
  const professorPage = await professorContext.newPage()

  try {
    await loginAsSeededUser(studentPage, 'vip@example.com')
    await studentPage.goto('/profile')
    await expect(studentPage.getByRole('button', { name: 'Edit profile' })).toBeVisible()
    await studentPage.getByRole('button', { name: 'Edit profile' }).click()

    const avatarResponsePromise = studentPage.waitForResponse((response) => (
      responsePath(response) === '/api/profile/me/media/avatar'
        && response.request().method() === 'POST'
    ))
    const avatarChooserPromise = studentPage.waitForEvent('filechooser')
    await studentPage.locator('label').filter({ hasText: 'Avatar image URL' }).getByRole('button', { name: 'Choose' }).click()
    await (await avatarChooserPromise).setFiles(pngUpload('avatar-e2e.png'))
    const avatarResponse = await avatarResponsePromise
    expect(avatarResponse.status()).toBe(200)
    const avatarUpload = await avatarResponse.json() as ProfileMediaResponse
    expectMockGcsMediaUrl(avatarUpload.url, '/profile/')
    expect(avatarUpload.url).toContain('/avatar-')
    await expect(studentPage.getByLabel('Avatar image URL')).toHaveValue(avatarUpload.url)

    const bannerResponsePromise = studentPage.waitForResponse((response) => (
      responsePath(response) === '/api/profile/me/media/banner'
        && response.request().method() === 'POST'
    ))
    const bannerChooserPromise = studentPage.waitForEvent('filechooser')
    await studentPage.locator('label').filter({ hasText: 'Banner image URL' }).getByRole('button', { name: 'Choose' }).click()
    await (await bannerChooserPromise).setFiles(pngUpload('banner-e2e.png'))
    const bannerResponse = await bannerResponsePromise
    expect(bannerResponse.status()).toBe(200)
    const bannerUpload = await bannerResponse.json() as ProfileMediaResponse
    expectMockGcsMediaUrl(bannerUpload.url, '/profile/')
    expect(bannerUpload.url).toContain('/banner-')
    await expect(studentPage.getByLabel('Banner image URL')).toHaveValue(bannerUpload.url)

    const profileResponse = await studentPage.request.get(apiUrl('/api/profile/me'))
    expect(profileResponse.status()).toBe(200)
    const profile = await profileResponse.json() as { avatar_url: string; banner_url: string }
    expect(profile.avatar_url).toBe(avatarUpload.url)
    expect(profile.banner_url).toBe(bannerUpload.url)

    await studentPage.goto('/professor-chat')
    await expect(studentPage.getByRole('heading', { name: /Pr Ahmed Kamil/i })).toBeVisible()
    const studentCaption = `Student GCS mock upload ${Date.now()}`
    await studentPage.locator('input[aria-label="Image attachment"]').setInputFiles(pngUpload('student-chat-e2e.png'))
    await expect(studentPage.getByText('student-chat-e2e.png')).toBeVisible()
    await studentPage.getByLabel('Message caption').fill(studentCaption)
    const studentImageResponsePromise = studentPage.waitForResponse((response) => (
      /\/api\/professor\/student-chat\/conversations\/\d+\/images$/.test(responsePath(response))
        && response.request().method() === 'POST'
    ))
    await studentPage.getByRole('button', { name: 'Send message' }).click()
    const studentImageResponse = await studentImageResponsePromise
    expect(studentImageResponse.status()).toBe(201)
    const studentImageMessage = await studentImageResponse.json() as ProfessorChatImageMessage
    expect(studentImageMessage.body).toBe(studentCaption)
    expect(studentImageMessage.attachment_mime_type).toBe('image/png')
    expect(studentImageMessage.attachment_name).toBe('student-chat-e2e.png')
    expectMockGcsMediaUrl(studentImageMessage.attachment_url, '/professor-chat/')
    await expect(studentPage.getByText(studentCaption, { exact: true })).toBeVisible()

    await loginAsSeededUser(professorPage, 'professor@example.com')
    await professorPage.goto('/professor/chat')
    await expect(professorPage.getByRole('heading', { name: 'Professor Chat' })).toBeVisible()
    await expect(professorPage.getByText('Sara Benali').first()).toBeVisible()
    const professorCaption = `Professor GCS mock upload ${Date.now()}`
    await professorPage.locator('input[aria-label="Image attachment"]').setInputFiles(pngUpload('professor-chat-e2e.png'))
    await expect(professorPage.getByText('professor-chat-e2e.png')).toBeVisible()
    await professorPage.getByLabel('Reply caption').fill(professorCaption)
    const professorImageResponsePromise = professorPage.waitForResponse((response) => (
      /\/api\/professor\/chat\/conversations\/\d+\/images$/.test(responsePath(response))
        && response.request().method() === 'POST'
    ))
    await professorPage.getByRole('button', { name: 'Send reply' }).click()
    const professorImageResponse = await professorImageResponsePromise
    expect(professorImageResponse.status()).toBe(201)
    const professorImageMessage = await professorImageResponse.json() as ProfessorChatImageMessage
    expect(professorImageMessage.body).toBe(professorCaption)
    expect(professorImageMessage.attachment_mime_type).toBe('image/png')
    expect(professorImageMessage.attachment_name).toBe('professor-chat-e2e.png')
    expectMockGcsMediaUrl(professorImageMessage.attachment_url, '/professor-chat/')
    await expect(professorPage.getByText(professorCaption, { exact: true })).toBeVisible()
  } finally {
    await studentContext.close()
    await professorContext.close()
  }
})

test('backend-backed negative states cover expired auth, forbidden, backend failure, and empty UI', async ({ browser }) => {
  const expiredContext = await browser.newContext({ baseURL: frontendOrigin })
  const forbiddenContext = await browser.newContext({ baseURL: frontendOrigin })
  const backendFailureContext = await browser.newContext({ baseURL: frontendOrigin })
  const emptyContext = await browser.newContext({ baseURL: frontendOrigin })

  try {
    await expiredContext.addCookies([
      {
        name: '__session',
        value: unsignedJwt({ exp: Math.floor(Date.now() / 1000) - 60 }),
        domain: '127.0.0.1',
        path: '/',
        sameSite: 'Lax',
      },
      {
        name: 'kresco_user_role',
        value: 'student',
        domain: '127.0.0.1',
        path: '/',
        sameSite: 'Lax',
      },
      {
        name: 'kresco_csrf',
        value: 'expired-csrf-token',
        domain: '127.0.0.1',
        path: '/',
        sameSite: 'Lax',
      },
    ])
    const expiredPage = await expiredContext.newPage()
    await expiredPage.goto('/home')
    await expect(expiredPage).toHaveURL(`${frontendOrigin}/`)
    const expiredCookies = await expiredContext.cookies(frontendOrigin)
    for (const name of authCookieNames) {
      expect(expiredCookies.some((cookie) => cookie.name === name)).toBe(false)
    }

    const forbiddenPage = await forbiddenContext.newPage()
    await loginAsSeededUser(forbiddenPage, 'student@example.com')
    await forbiddenPage.goto('/admin')
    await expect(forbiddenPage).toHaveURL(/\/admin$/)
    await expect(forbiddenPage.getByRole('heading', { name: 'Staff access required' })).toBeVisible()
    await expect(forbiddenPage.getByText('Your account is signed in, but it does not have permission to open this area.')).toBeVisible()
    const storedForbiddenUser = await forbiddenPage.evaluate(() => window.localStorage.getItem('kresco_user'))
    expect(JSON.parse(storedForbiddenUser || '{}')).toMatchObject({
      __kresco_minimal_auth_snapshot: true,
      role: 'student',
      is_staff: false,
    })

    const backendFailurePage = await backendFailureContext.newPage()
    await loginViaBackend(backendFailurePage, 'admin@example.com')
    let overviewFailures = 0
    await backendFailurePage.route('**/api/admin/overview', async (route) => {
      overviewFailures += 1
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'controlled E2E admin overview failure' }),
      })
    })
    await backendFailurePage.goto('/admin')
    await expect(backendFailurePage.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()
    await expect(backendFailurePage.getByText('Les analyses en direct n’ont pas pu être chargées.')).toBeVisible()
    expect(overviewFailures).toBeGreaterThan(0)

    const emptyPage = await emptyContext.newPage()
    await loginAsSeededUser(emptyPage, 'student@example.com')
    await emptyPage.route('**/api/courses/topics', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    await emptyPage.route('**/api/courses/subjects', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    await emptyPage.goto('/home')
    await expect(emptyPage.getByText('No lessons in progress')).toBeVisible()
    await expect(emptyPage.getByText('No subjects available')).toBeVisible()
  } finally {
    await expiredContext.close()
    await forbiddenContext.close()
    await backendFailureContext.close()
    await emptyContext.close()
  }
})

test('backend-backed route fallbacks stay non-blank on controlled API failures', async ({ browser }) => {
  const subjectContext = await browser.newContext({ baseURL: frontendOrigin })
  const topicContext = await browser.newContext({ baseURL: frontendOrigin })
  const examContext = await browser.newContext({ baseURL: frontendOrigin })

  try {
    const subjectPage = await subjectContext.newPage()
    await loginViaBackend(subjectPage, 'student@example.com')
    const subject = await firstSeededSubject(subjectPage)
    let subjectFailures = 0
    await subjectPage.route(`**/api/courses/subjects/${subject.id}`, async (route) => {
      subjectFailures += 1
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'controlled E2E subject detail failure' }),
      })
    })
    await subjectPage.goto(`/home/${subject.id}`)
    await expect(subjectPage).toHaveURL(new RegExp(`/home/${subject.id}$`))
    await expect(subjectPage.getByRole('heading', { name: 'This subject could not be loaded.' })).toBeVisible()
    await expect(subjectPage.getByRole('button', { name: 'Retry' })).toBeVisible()
    await expect(subjectPage.getByRole('link', { name: 'Back home' })).toBeVisible()
    expect(subjectFailures).toBeGreaterThan(0)

    const topicPage = await topicContext.newPage()
    await loginViaBackend(topicPage, 'student@example.com')
    const topic = await firstAccessibleTopic(topicPage)
    let topicFailures = 0
    await topicPage.route(`**/api/courses/topics/${topic.id}/workspace**`, async (route) => {
      topicFailures += 1
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'controlled E2E topic workspace failure' }),
      })
    })
    await topicPage.goto(`/topics/${topic.id}`)
    await expect(topicPage).toHaveURL(new RegExp(`/topics/${topic.id}$`))
    await expect(topicPage.getByRole('heading', { name: 'This topic workspace could not be loaded.' })).toBeVisible()
    await expect(topicPage.getByRole('button', { name: 'Retry' })).toBeVisible()
    await expect(topicPage.getByRole('link', { name: 'Back home' })).toBeVisible()
    expect(topicFailures).toBeGreaterThan(0)

    const examPage = await examContext.newPage()
    await loginViaBackend(examPage, 'student@example.com')
    const examSubject = await firstSeededSubject(examPage)
    let examFailures = 0
    await examPage.route(`**/api/quizzes/subjects/${examSubject.id}/discovery`, async (route) => {
      examFailures += 1
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'controlled E2E exam subject failure' }),
      })
    })
    await examPage.goto(`/exam/${examSubject.id}`)
    await expect(examPage).toHaveURL(new RegExp(`/exam/${examSubject.id}$`))
    await expect(examPage.getByRole('heading', { name: 'This exam could not be loaded.' })).toBeVisible()
    await expect(examPage.getByRole('button', { name: 'Retry' })).toBeVisible()
    await expect(examPage.getByRole('link', { name: 'Back home' })).toBeVisible()
    expect(examFailures).toBeGreaterThan(0)
  } finally {
    await subjectContext.close()
    await topicContext.close()
    await examContext.close()
  }
})

test('backend-backed professor live session becomes student-visible with interaction and checkpoint', async ({ browser }) => {
  const professorContext = await browser.newContext({ baseURL: frontendOrigin })
  const studentContext = await browser.newContext({ baseURL: frontendOrigin })
  const professorPage = await professorContext.newPage()
  const studentPage = await studentContext.newPage()

  try {
    await loginAsSeededUser(professorPage, 'professor@example.com')

    const offeringsResponse = await professorPage.request.get(apiUrl('/api/professor/offerings'))
    expect(offeringsResponse.status()).toBe(200)
    const offerings = await offeringsResponse.json() as CourseOffering[]
    const studentOffering = offerings.find((offering) => (
      offering.track.niveau === '2BAC'
        && /sciences math/i.test(offering.track.filiere)
    ))
    expect(studentOffering, 'expected professor seed to include a 2BAC Sciences Math offering visible to VIP student').toBeTruthy()

    await professorPage.goto('/professor/live')
    await expect(professorPage.getByRole('heading', { name: 'Live Sessions' })).toBeVisible()

    const title = `Backend-backed Playwright live ${Date.now()}`
    const liveId = `e2e-live-${Date.now()}`
    await expect(professorPage.locator(`select[aria-label="Offering"] option[value="${studentOffering!.id}"]`)).toHaveCount(1)
    await professorPage.getByLabel('Offering').selectOption(String(studentOffering!.id))
    await professorPage.getByLabel('Title').fill(title)
    await professorPage.getByLabel('VdoCipher live ID').fill(liveId)

    const createResponsePromise = professorPage.waitForResponse((response) => (
      responsePath(response) === '/api/professor/live-sessions'
        && response.request().method() === 'POST'
    ))
    await professorPage.getByRole('button', { name: 'Create session' }).click()
    const createResponse = await createResponsePromise
    expect(createResponse.status()).toBe(201)
    const createdSession = await createResponse.json() as ProfessorLiveSession
    expect(createdSession.title).toBe(title)
    await expect(professorPage.locator('article').filter({ hasText: title })).toBeVisible()

    await professorPage.getByRole('button', { name: `${title} actions` }).click()
    const startResponsePromise = professorPage.waitForResponse((response) => (
      responsePath(response) === `/api/professor/live-sessions/${createdSession.id}/start`
        && response.request().method() === 'POST'
    ))
    await professorPage.getByRole('button', { name: 'Start session' }).click()
    const startResponse = await startResponsePromise
    expect(startResponse.status()).toBe(200)
    const liveSession = await startResponse.json() as ProfessorLiveSession
    expect(liveSession.status).toBe('live')
    await expect(professorPage.locator('article').filter({ hasText: title }).locator('span').filter({ hasText: /^live$/ })).toBeVisible()

    const checkpointTitle = `E2E checkpoint ${createdSession.id}`
    const checkpointResponse = await professorPage.request.post(apiUrl(`/api/professor/live-sessions/${createdSession.id}/checkpoints`), {
      headers: await csrfRequestHeaders(professorPage),
      data: {
        title: checkpointTitle,
        prompt: 'Confirm the live example step.',
        checkpoint_type: 'prompt',
      },
    })
    expect(checkpointResponse.status()).toBe(201)
    const checkpoint = await checkpointResponse.json() as LiveSessionCheckpoint
    expect(checkpoint.title).toBe(checkpointTitle)
    expect(checkpoint.status).toBe('active')

    await loginAsSeededUser(studentPage, 'vip@example.com')
    const studentListResponsePromise = studentPage.waitForResponse((response) => (
      responsePath(response) === '/api/professor/student-live-sessions'
        && response.request().method() === 'GET'
    ))
    await studentPage.goto('/live')
    const studentListResponse = await studentListResponsePromise
    expect(studentListResponse.status()).toBe(200)
    const studentSessions = await studentListResponse.json() as StudentLiveSession[]
    const visibleSession = studentSessions.find((session) => session.id === createdSession.id)
    expect(visibleSession?.can_join).toBe(true)
    const studentSessionCard = studentPage.locator('article').filter({ hasText: title }).first()
    await expect(studentSessionCard).toBeVisible()
    const studentJoinLink = studentSessionCard.locator(`a[href="/live/${createdSession.id}"]`).first()

    const embedResponsePromise = studentPage.waitForResponse((response) => (
      responsePath(response) === `/api/professor/student-live-sessions/${createdSession.id}/embed`
        && response.request().method() === 'GET'
    ))
    await studentJoinLink.click()
    const embedResponse = await embedResponsePromise
    expect(embedResponse.status()).toBe(200)
    await expect(studentPage.getByRole('heading', { name: title })).toBeVisible()

    const studentCheckpointsResponse = await studentPage.request.get(apiUrl(`/api/professor/student-live-sessions/${createdSession.id}/checkpoints`))
    expect(studentCheckpointsResponse.status()).toBe(200)
    const studentCheckpoints = await studentCheckpointsResponse.json() as LiveSessionCheckpoint[]
    expect(studentCheckpoints.some((item) => item.id === checkpoint.id && item.title === checkpointTitle)).toBe(true)

    const question = `Does this backend-backed live question reach the professor ${Date.now()}?`
    await studentPage.getByRole('button', { name: /^Q&A/ }).click()
    await studentPage.getByLabel('Ask the professor').fill(question)
    const interactionResponsePromise = studentPage.waitForResponse((response) => (
      responsePath(response) === `/api/professor/student-live-sessions/${createdSession.id}/interactions`
        && response.request().method() === 'POST'
    ))
    await studentPage.getByRole('button', { name: 'Send question' }).click()
    const interactionResponse = await interactionResponsePromise
    expect(interactionResponse.status()).toBe(201)
    const interaction = await interactionResponse.json() as LiveSessionInteraction
    expect(interaction.body).toBe(question)
    expect(interaction.kind).toBe('question')
    await expect(studentPage.getByText(question)).toBeVisible()

    const interactionsResponsePromise = professorPage.waitForResponse((response) => (
      responsePath(response) === `/api/professor/live-sessions/${createdSession.id}/interactions`
        && response.request().method() === 'GET'
    ))
    await professorPage.goto(`/professor/live/${createdSession.id}`)
    const interactionsResponse = await interactionsResponsePromise
    expect(interactionsResponse.status()).toBe(200)
    await expect(professorPage.getByRole('heading', { name: title })).toBeVisible()
    const professorQuestion = professorPage.locator('article').filter({ hasText: question }).first()
    await expect(professorQuestion).toBeVisible()

    const answerResponsePromise = professorPage.waitForResponse((response) => (
      responsePath(response) === `/api/professor/live-sessions/interactions/${interaction.id}`
        && response.request().method() === 'PATCH'
    ))
    await professorQuestion.getByRole('button', { name: 'Set as answered' }).click()
    const answerResponse = await answerResponsePromise
    expect(answerResponse.status()).toBe(200)
    const answeredInteraction = await answerResponse.json() as LiveSessionInteraction
    expect(answeredInteraction.status).toBe('answered')
    await expect(professorQuestion.getByText('answered')).toBeVisible()
  } finally {
    await professorContext.close()
    await studentContext.close()
  }
})
