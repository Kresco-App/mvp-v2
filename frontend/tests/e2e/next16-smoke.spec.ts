import { expect, type Page, test } from '@playwright/test'

const apiBase = /\/api\//

const smokeUser = {
  id: 1,
  email: 'student@example.com',
  full_name: 'Khalid Tester',
  niveau: '2bac',
  filiere: 'Bac Sciences Mathematiques A',
  is_pro: true,
  role: 'student',
  tier: 'vip',
  is_staff: true,
  avatar_url: null,
}

const smokeProfessor = {
  id: 31,
  email: 'professor@example.com',
  full_name: 'Pr Ahmed Kamil',
  niveau: '',
  filiere: '',
  is_pro: false,
  role: 'professor',
  tier: 'basic',
  is_staff: false,
  avatar_url: null,
}

const smokePhysicsProfessor = {
  ...smokeProfessor,
  id: 34,
  email: 'physics-professor@example.com',
  full_name: 'Pr Lina Berrada',
}

const smokeBasicStudent = {
  ...smokeUser,
  id: 32,
  email: 'basic@example.com',
  full_name: 'Nora Basic',
  tier: 'basic',
  is_pro: false,
}

const calendarEvent = {
  id: 7,
  event_type: 'live_session',
  title: 'Live calculus review',
  subtitle: 'Limits workshop',
  teacher_name: 'Prof. Amal',
  subject_id: 1,
  subject_title: 'Mathematics',
  topic_id: 42,
  topic_title: 'Limits and Continuity',
  starts_at: new Date().toISOString(),
  ends_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  description: 'Bring your function limits notes.',
  preparation_href: '/topics/42',
  join_url: '',
  status: 'scheduled',
  color: '#453dee',
}

const topicItem = {
  id: 101,
  topic_id: 42,
  section_id: 11,
  title: 'Continuity introduction',
  description: 'A short smoke-test lesson for the topic workspace.',
  item_type: 'video',
  renderer_key: '',
  duration_seconds: 600,
  progress_status: 'in_progress',
  can_access: true,
  primary_resource: null,
  tabs: [
    {
      id: 501,
      label: 'Course',
      tab_type: 'course',
      content: 'Mock course content for continuity and limits.',
      config_json: {},
      renderer_key: '',
      order: 1,
      can_access: true,
      resource: null,
    },
    {
      id: 502,
      label: 'Lab',
      tab_type: 'lab',
      content: 'Wave periodicity lab smoke coverage.',
      config_json: {
        renderer_key: 'wave_periodicity',
        title: 'Periodicite des ondes',
        description: 'Browser smoke for lazy animated renderer chunks.',
      },
      renderer_key: 'wave_periodicity',
      order: 2,
      can_access: true,
      resource: null,
    },
  ],
}

const topicWorkspace = {
  id: 42,
  subject_title: 'Mathematics',
  title: 'Limits and Continuity',
  description: 'Mocked workspace for browser smoke coverage.',
  progress_pct: 25,
  completed_count: 0,
  item_count: 1,
  active_item_id: topicItem.id,
  sections: [
    {
      id: 11,
      title: 'Lessons',
      section_type: 'lesson',
      order: 1,
      items: [topicItem],
    },
  ],
  active_item: topicItem,
  search_results: [],
  can_access: true,
}

const section = {
  id: 101,
  title: 'Mock limits video',
  section_type: 'video',
  order: 1,
  duration_seconds: 600,
  is_free_preview: true,
  is_completed: false,
  is_locked: false,
  video_url: '',
  text_content: '',
  quiz_data: null,
  pass_score: 70,
  activity_data: null,
}

const adminOverview = {
  generated_at: new Date().toISOString(),
  totals: {
    users: 12,
    pro_users: 3,
    topics: 8,
    topic_items: 24,
    resources: 6,
    tab_contents: 18,
    quiz_attempts: 14,
    activity_events: 32,
    exam_problems: 9,
    exams: 2,
  },
  content_status: {
    subjects: { published: 2 },
    topics: { published: 8 },
    topic_items: { published: 24 },
    resources: { published: 6 },
    tab_contents: { published: 18 },
    exam_problems: { published: 9 },
  },
  access_billing: {
    gated_content: {
      topic_items_with_required_tier: 4,
      free_preview_topic_items: 5,
    },
  },
  ops_readiness: {
    local_validation: { mode: 'smoke' },
  },
  progress_xp: {
    completed_topic_items: 4,
    completed_lessons: 3,
  },
  exam_bank: {},
  calendar: {},
  engagement: {
    quiz_attempt_pass_rate: 75,
    active_users_7d: 5,
  },
  interactions: {},
  notifications: {},
  admin_audit: {},
  crud_catalog: [],
}

const professorTrack = {
  id: 41,
  niveau: '2BAC',
  filiere: 'Sciences Math B',
  title: '2BAC Sciences Math B',
  status: 'active',
}

const professorOffering = {
  id: 51,
  subject_id: 1,
  subject_title: 'Mathematics',
  track: professorTrack,
  professor_user_id: smokeProfessor.id,
  title: 'Mathematics - 2BAC Sciences Math B',
  status: 'active',
}

const physicsProfessorOffering = {
  id: 52,
  subject_id: 2,
  subject_title: 'Physics',
  track: professorTrack,
  professor_user_id: smokePhysicsProfessor.id,
  title: 'Physics - 2BAC Sciences Math B',
  status: 'active',
}

const professorLiveSessions = [
  {
    id: 61,
    course_offering_id: professorOffering.id,
    title: 'Live correction: limits national exam',
    description: 'Bring your notes, checkpoint quiz, and two questions.',
    starts_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    ends_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    status: 'scheduled',
    join_url: 'https://live.kresco.local/demo',
    vdocipher_live_id: 'vdo-demo-scheduled',
    stream_ingest_url: 'rtmp://ingest.vdocipher.local/live',
    stream_key: 'scheduled-stream-key',
    notification_status: 'sent',
    created_at: new Date().toISOString(),
  },
  {
    id: 62,
    course_offering_id: professorOffering.id,
    title: 'Open Q&A: continuity and IVT',
    description: 'Live now for VIP checkpoint questions.',
    starts_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    ends_at: new Date(Date.now() + 55 * 60 * 1000).toISOString(),
    status: 'live',
    join_url: 'https://live.kresco.local/demo',
    vdocipher_live_id: 'vdo-demo-live',
    stream_ingest_url: 'rtmp://ingest.vdocipher.local/live',
    stream_key: 'live-stream-key',
    notification_status: 'live',
    created_at: new Date().toISOString(),
  },
  {
    id: 63,
    course_offering_id: professorOffering.id,
    title: 'Recorded recap: function domains',
    description: 'Completed recap session.',
    starts_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    ends_at: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
    status: 'completed',
    join_url: 'https://live.kresco.local/demo',
    vdocipher_live_id: 'vdo-demo-completed',
    stream_ingest_url: '',
    stream_key: '',
    notification_status: 'sent',
    created_at: new Date().toISOString(),
  },
]

const studentLiveSessions = professorLiveSessions.map((session) => ({
  id: session.id,
  course_offering_id: session.course_offering_id,
  title: session.title,
  description: session.description,
  starts_at: session.starts_at,
  ends_at: session.ends_at,
  status: session.status,
  join_url: session.join_url,
  vdocipher_live_id: session.vdocipher_live_id,
  notification_status: session.notification_status,
  created_at: session.created_at,
  offering_title: professorOffering.title,
  subject_title: professorOffering.subject_title,
  niveau: professorTrack.niveau,
  filiere: professorTrack.filiere,
  teacher_name: smokeProfessor.full_name,
  viewer_url: `/live/${session.id}`,
  can_join: session.status === 'live',
  provider: 'vdocipher',
}))

const liveInteractions = [
  {
    id: 101,
    live_session_id: 62,
    course_offering_id: professorOffering.id,
    professor_user_id: smokeProfessor.id,
    student_user_id: smokeUser.id,
    student_name: smokeUser.full_name,
    kind: 'question',
    body: 'Can you repeat the IVT proof step?',
    status: 'pending',
    answer: '',
    answered_by_user_id: null,
    answered_at: null,
    deleted_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 102,
    live_session_id: 62,
    course_offering_id: professorOffering.id,
    professor_user_id: smokeProfessor.id,
    student_user_id: smokeUser.id,
    student_name: smokeUser.full_name,
    kind: 'message',
    body: 'Audio and slides are clear.',
    status: 'answered',
    answer: 'Thanks, keep this pace for the checkpoint.',
    answered_by_user_id: smokeProfessor.id,
    answered_at: new Date().toISOString(),
    deleted_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
]

const liveCheckpoints = [
  {
    id: 111,
    live_session_id: 62,
    course_offering_id: professorOffering.id,
    professor_user_id: smokeProfessor.id,
    title: 'Checkpoint: IVT conditions',
    prompt: 'List the two hypotheses before applying the theorem.',
    checkpoint_type: 'prompt',
    status: 'active',
    created_at: new Date().toISOString(),
    closed_at: null,
  },
]

function mockFrameUrl(label: string) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(`
    <html>
      <body style="margin:0;height:100vh;display:grid;place-items:center;background:#0f0f12;color:white;font:700 18px system-ui,sans-serif;">
        ${label}
      </body>
    </html>
  `)}`
}

const professorChangeRequests = [
  {
    id: 71,
    course_offering_id: professorOffering.id,
    target_type: 'topic',
    target_id: 42,
    change_type: 'update_fields',
    proposed_patch_json: { title: 'Limits and Continuity - National Focus' },
    current_snapshot_json: { title: 'Limits and Continuity' },
    status: 'pending',
    admin_note: '',
    created_at: new Date().toISOString(),
    reviewed_at: null,
  },
  {
    id: 72,
    course_offering_id: professorOffering.id,
    target_type: 'topic_item',
    target_id: 101,
    change_type: 'update_fields',
    proposed_patch_json: { title: 'Continuity proof walkthrough', duration_seconds: 1200 },
    current_snapshot_json: { title: 'Continuity introduction' },
    status: 'pending',
    admin_note: '',
    created_at: new Date().toISOString(),
    reviewed_at: null,
  },
  {
    id: 73,
    course_offering_id: professorOffering.id,
    target_type: 'tab_content',
    target_id: 501,
    change_type: 'update_fields',
    proposed_patch_json: { content: 'Add tangent-line example.' },
    current_snapshot_json: { content: 'Existing quiz content.' },
    status: 'approved',
    admin_note: 'Demo approved admin note',
    created_at: new Date().toISOString(),
    reviewed_at: new Date().toISOString(),
  },
  {
    id: 74,
    course_offering_id: professorOffering.id,
    target_type: 'topic_item',
    target_id: 102,
    change_type: 'update_fields',
    proposed_patch_json: { title: 'Remove optimisation checkpoint' },
    current_snapshot_json: { title: 'Optimisation checkpoint' },
    status: 'rejected',
    admin_note: 'Demo rejected admin note',
    created_at: new Date().toISOString(),
    reviewed_at: new Date().toISOString(),
  },
]

const professorConversations = [
  {
    id: 81,
    course_offering_id: professorOffering.id,
    offering_title: professorOffering.title,
    subject_title: 'Mathematics',
    niveau: '2BAC',
    filiere: 'Sciences Math B',
    professor: {
      id: smokeProfessor.id,
      full_name: smokeProfessor.full_name,
      avatar_url: '',
      tier: 'basic',
    },
    student: {
      id: smokeUser.id,
      full_name: 'Sara Benali',
      avatar_url: '',
      tier: 'vip',
    },
    status: 'open',
    last_message_preview: 'Can you review my final proof step?',
    unread_for_professor: 2,
    unread_for_student: 0,
    is_pinned_by_professor: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_message_at: new Date().toISOString(),
  },
  {
    id: 82,
    course_offering_id: professorOffering.id,
    offering_title: professorOffering.title,
    subject_title: 'Mathematics',
    niveau: '2BAC',
    filiere: 'Sciences Math B',
    professor: {
      id: smokeProfessor.id,
      full_name: smokeProfessor.full_name,
      avatar_url: '',
      tier: 'basic',
    },
    student: {
      id: 33,
      full_name: 'Youssef El Idrissi',
      avatar_url: '',
      tier: 'platinum',
    },
    status: 'open',
    last_message_preview: 'Thanks, I will try the variation table again.',
    unread_for_professor: 0,
    unread_for_student: 1,
    is_pinned_by_professor: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_message_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  },
]

const professorMessages = [
  {
    id: 91,
    conversation_id: 81,
    sender_user_id: smokeUser.id,
    sender_role: 'student',
    body: 'Can you explain why the final limit is not zero?',
    status: 'sent',
    created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    read_at: null,
  },
  {
    id: 92,
    conversation_id: 81,
    sender_user_id: smokeProfessor.id,
    sender_role: 'professor',
    body: 'Check the dominant term before cancelling. The denominator wins here.',
    status: 'sent',
    created_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    read_at: null,
  },
  {
    id: 93,
    conversation_id: 81,
    sender_user_id: smokeUser.id,
    sender_role: 'student',
    body: 'Can you review my final proof step?',
    status: 'sent',
    created_at: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    read_at: null,
  },
]

const studentProfessorChat = {
  eligible: true,
  reason: '',
  offerings: [professorOffering, physicsProfessorOffering],
  conversations: professorConversations.slice(0, 1),
  teacher_threads: [
    {
      course_offering_id: professorOffering.id,
      offering_title: professorOffering.title,
      subject_title: professorOffering.subject_title,
      niveau: professorOffering.track.niveau,
      filiere: professorOffering.track.filiere,
      professor: professorConversations[0].professor,
      conversation: professorConversations[0],
      last_message_preview: professorConversations[0].last_message_preview,
      last_message_sender_role: 'student',
      unread_count: 0,
      last_message_at: professorConversations[0].last_message_at,
    },
    {
      course_offering_id: physicsProfessorOffering.id,
      offering_title: physicsProfessorOffering.title,
      subject_title: physicsProfessorOffering.subject_title,
      niveau: physicsProfessorOffering.track.niveau,
      filiere: physicsProfessorOffering.track.filiere,
      professor: {
        id: smokePhysicsProfessor.id,
        full_name: smokePhysicsProfessor.full_name,
        avatar_url: '',
        tier: 'basic',
      },
      conversation: null,
      last_message_preview: '',
      last_message_sender_role: '',
      unread_count: 0,
      last_message_at: null,
    },
  ],
}

function makeTestJwt() {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ exp: Math.floor(Date.now() / 1000) + 3600 })}.smoke`
}

async function seedAuthenticatedUser(page: Page, user = smokeUser) {
  await page.goto('/')
  await page.evaluate(
    ({ token, user }) => {
      window.localStorage.setItem('kresco_user', JSON.stringify(user))
      window.document.cookie = `kresco_token=${encodeURIComponent(token)}; Path=/; SameSite=Lax; Max-Age=3600`
      window.document.cookie = `kresco_user_role=${encodeURIComponent(user.role)}; Path=/; SameSite=Lax; Max-Age=3600`
    },
    { token: makeTestJwt(), user },
  )
}

async function mockApi(page: Page) {
  await page.route(apiBase, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace(/^\/api/, '')

    if (request.method() === 'POST' || request.method() === 'PATCH') {
      await route.fulfill({ json: { ok: true, xp_earned: 0, is_pro: true } })
      return
    }

    if (path === '/calendar/events') {
      await route.fulfill({ json: [calendarEvent] })
      return
    }

    if (path === '/payments/verify-session') {
      await route.fulfill({ json: { is_pro: true } })
      return
    }

    if (path === '/profile/me') {
      const referer = request.headers().referer || ''
      await route.fulfill({ json: referer.includes('/professor') ? smokeProfessor : smokeUser })
      return
    }

    if (path === '/admin/overview') {
      await route.fulfill({ json: adminOverview })
      return
    }

    if (path === '/professor/dashboard') {
      await route.fulfill({
        json: {
          offerings: [professorOffering],
          active_offering: professorOffering,
          upcoming_live_sessions: professorLiveSessions,
          pending_change_requests: professorChangeRequests.filter((request) => request.status === 'pending'),
          chat_unread_count: 2,
          chat_pinned_count: 1,
        },
      })
      return
    }

    if (path === '/professor/offerings') {
      await route.fulfill({ json: [professorOffering] })
      return
    }

    if (path === '/professor/live-provider-config') {
      await route.fulfill({
        json: {
          provider: 'vdocipher',
          has_api_secret: true,
          can_auto_create: true,
          missing: [],
          create_endpoint_configured: true,
        },
      })
      return
    }

    if (path === '/professor/live-sessions') {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 201, json: professorLiveSessions[0] })
      } else {
        await route.fulfill({ json: professorLiveSessions })
      }
      return
    }

    if (/^\/professor\/live-sessions\/\d+\/embed$/.test(path)) {
      const id = Number(path.split('/')[3])
      const session = professorLiveSessions.find((item) => item.id === id) ?? professorLiveSessions[0]
      await route.fulfill({
        json: {
          id: session.id,
          title: session.title,
          status: session.status,
          provider: 'vdocipher',
          embed_url: mockFrameUrl('VdoCipher live player'),
          chat_embed_url: '',
          vdocipher_live_id: session.vdocipher_live_id,
        },
      })
      return
    }

    if (/^\/professor\/live-sessions\/\d+\/interactions$/.test(path)) {
      const id = Number(path.split('/')[3])
      await route.fulfill({ json: liveInteractions.filter((item) => item.live_session_id === id) })
      return
    }

    if (/^\/professor\/live-sessions\/\d+\/checkpoints$/.test(path)) {
      const id = Number(path.split('/')[3])
      await route.fulfill({ json: liveCheckpoints.filter((item) => item.live_session_id === id) })
      return
    }

    if (path === '/professor/student-live-sessions') {
      await route.fulfill({ json: studentLiveSessions })
      return
    }

    if (/^\/professor\/student-live-sessions\/\d+\/embed$/.test(path)) {
      const id = Number(path.split('/')[3])
      const session = studentLiveSessions.find((item) => item.id === id) ?? studentLiveSessions[0]
      await route.fulfill({
        json: {
          id: session.id,
          title: session.title,
          status: session.status,
          provider: 'vdocipher',
          embed_url: mockFrameUrl('VdoCipher live player'),
          chat_embed_url: '',
          vdocipher_live_id: session.vdocipher_live_id,
        },
      })
      return
    }

    if (/^\/professor\/student-live-sessions\/\d+\/interactions$/.test(path)) {
      const id = Number(path.split('/')[3])
      await route.fulfill({ json: liveInteractions.filter((item) => item.live_session_id === id) })
      return
    }

    if (/^\/professor\/student-live-sessions\/\d+\/checkpoints$/.test(path)) {
      const id = Number(path.split('/')[3])
      await route.fulfill({ json: liveCheckpoints.filter((item) => item.live_session_id === id) })
      return
    }

    if (path === '/notifications') {
      await route.fulfill({
        json: {
          unread_count: 1,
          notifications: [
            {
              id: 1,
              type: 'live_session',
              title: 'Live correction scheduled',
              body: 'Limits national exam correction was added to your calendar.',
              is_read: false,
              created_at: '2026-05-21T12:00:00Z',
            },
          ],
        },
      })
      return
    }

    if (path === '/professor/change-requests') {
      const requestedStatus = url.searchParams.get('status') || 'pending'
      await route.fulfill({ json: professorChangeRequests.filter((request) => request.status === requestedStatus) })
      return
    }

    if (path === '/professor/chat/conversations') {
      let conversations = professorConversations
      if (url.searchParams.get('unread') === 'true') {
        conversations = conversations.filter((conversation) => conversation.unread_for_professor > 0)
      }
      if (url.searchParams.get('pinned') === 'true') {
        conversations = conversations.filter((conversation) => conversation.is_pinned_by_professor)
      }
      const q = url.searchParams.get('q')?.toLowerCase()
      if (q) {
        conversations = conversations.filter((conversation) => (
          conversation.student.full_name.toLowerCase().includes(q)
          || conversation.last_message_preview.toLowerCase().includes(q)
        ))
      }
      await route.fulfill({ json: conversations })
      return
    }

    if (path === '/professor/chat/conversations/81/messages') {
      await route.fulfill({ json: professorMessages })
      return
    }

    if (path === '/professor/chat/conversations/82/messages') {
      await route.fulfill({ json: professorMessages.slice(0, 2) })
      return
    }

    if (path === '/professor/student-chat') {
      await route.fulfill({ json: studentProfessorChat })
      return
    }

    if (path === '/professor/student-chat/conversations/81/messages') {
      await route.fulfill({ json: professorMessages })
      return
    }

    if (path === '/courses/topics/42/workspace') {
      await route.fulfill({ json: topicWorkspace })
      return
    }

    if (path === '/courses/sections/101/watch-context') {
      await route.fulfill({
        json: {
          section: { ...section, chapter_id: 11 },
          chapter: {
            id: 11,
            title: 'Limits chapter',
            description: '',
            order: 1,
            sections: [{ ...section, chapter_id: 11 }],
          },
          subject_id: 1,
          subject_title: 'Mathematics',
          chapters: [
            {
              id: 11,
              title: 'Limits chapter',
              description: '',
              order: 1,
              sections: [{ ...section, chapter_id: 11 }],
            },
          ],
        },
      })
      return
    }

    if (path === '/courses/subjects') {
      await route.fulfill({ json: [{ id: 1, title: 'Mathematics' }] })
      return
    }

    if (path === '/courses/subjects/1') {
      await route.fulfill({ json: { id: 1, title: 'Mathematics', chapters: [{ id: 11, title: 'Limits chapter' }] } })
      return
    }

    if (path === '/courses/chapters/11/sections') {
      await route.fulfill({ json: [section] })
      return
    }

    if (path === '/progress/sections/101/access') {
      await route.fulfill({ json: { can_access: true } })
      return
    }

    if (path === '/courses/sections/101/stream') {
      await route.fulfill({ json: { otp: 'mock-otp-token', playback_info: 'mock-playback' } })
      return
    }

    if (path === '/courses/lessons/101/pdfs' || path === '/interactions/comments' || path === '/progress/lessons/101/quiz-triggers') {
      await route.fulfill({ json: [] })
      return
    }

    await route.fulfill({ json: {} })
  })
}

function collectCriticalBrowserErrors(page: Page) {
  const errors: string[] = []

  page.on('console', (message) => {
    const text = message.text()
    if (message.type() === 'error' && /hydration|did not match|server rendered|client rendered|Minified React error/i.test(text)) {
      errors.push(text)
    }
  })

  page.on('pageerror', (error) => {
    if (error.message === 'Connection closed') return
    errors.push(error.message)
  })

  return {
    assertClean() {
      expect(errors).toEqual([])
    },
  }
}

test.beforeEach(async ({ page }) => {
  await page.route('https://accounts.google.com/**', (route) => route.abort())
  await mockApi(page)
})

test('public auth and reset-password routes hydrate', async ({ page }) => {
  const browserErrors = collectCriticalBrowserErrors(page)

  await page.goto('/')
  await expect(page).toHaveTitle(/Kresco/)
  await expect(page.getByRole('heading', { name: /Bienvenue sur Kresco/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Local demo login/i })).toHaveCount(0)

  await page.goto('/auth/reset-password?token=smoke-token')
  await expect(page.getByRole('heading', { name: /Nouveau mot de passe/i })).toBeVisible()
  await expect(page.locator('input[type="password"]').first()).toBeVisible()
  await expect(page.locator('input[type="password"]').nth(1)).toBeVisible()

  browserErrors.assertClean()
})

test('authenticated dashboard, payment, and admin routes hydrate with mocked APIs', async ({ page }) => {
  const browserErrors = collectCriticalBrowserErrors(page)
  await seedAuthenticatedUser(page)

  await page.goto('/calendar')
  await expect(page.getByLabel('Weekly calendar')).toBeVisible()
  await expect(page.getByText('Live calculus review')).toBeVisible()

  await page.goto('/payment-success?session_id=cs_test_smoke')
  await expect(page.getByText('Bienvenue dans Kresco Pro !')).toBeVisible()

  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: /Operations control center/i })).toBeVisible()
  await expect(page.getByText('Live analytics')).toBeVisible()

  browserErrors.assertClean()
})

test('topic workspace and watch routes hydrate with mocked course data', async ({ page }) => {
  const browserErrors = collectCriticalBrowserErrors(page)
  await seedAuthenticatedUser(page)

  await page.goto('/topics/42')
  await expect(page.getByRole('heading', { name: /Mathematics: Continuity introduction/i })).toBeVisible()
  await expect(page.getByText('Mock course content for continuity and limits.')).toBeVisible()
  await expect(page.getByLabel('Search this topic')).toBeVisible()
  await page.getByRole('button', { name: /Lab/i }).click()
  await expect(page.getByText('Periodicite des ondes')).toBeVisible()

  await page.goto('/watch/101')
  await expect(page.getByRole('heading', { name: 'Mock limits video' })).toBeVisible()
  await expect(page.getByText('Lecteur video de demo')).toBeVisible()
  await expect(page.getByRole('button', { name: /Mes notes/i })).toBeVisible()

  browserErrors.assertClean()
})

test('professor dashboard, live sessions, change requests, and chat hydrate with full mock data', async ({ page }) => {
  const browserErrors = collectCriticalBrowserErrors(page)
  await seedAuthenticatedUser(page, smokeProfessor)

  await page.goto('/professor')
  await expect(page.getByRole('heading', { name: 'Professor Dashboard' })).toBeVisible()
  await expect(page.getByText('Mathematics - 2BAC Sciences Math B')).toBeVisible()
  await expect(page.getByText('Live correction: limits national exam')).toBeVisible()
  await expect(page.getByText('VIP private conversations are student-initiated only.')).toBeVisible()

  await page.goto('/professor/live')
  await expect(page.getByRole('heading', { name: 'Live Sessions' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Open Q&A: continuity and IVT' }).last()).toBeVisible()
  await expect(page.getByText('Recorded recap: function domains')).toBeVisible()
  await page.screenshot({ path: 'artifacts/context-screenshots/professor-live-crud-smoke.png', fullPage: true })

  await page.goto('/professor/live/62')
  await expect(page.getByRole('heading', { name: 'Open Q&A: continuity and IVT' })).toBeVisible()
  await expect(page.getByText('rtmp://ingest.vdocipher.local/live')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Live room' })).toBeVisible()
  await expect(page.getByText('Can you repeat the IVT proof step?')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Set as answered' })).toBeVisible()
  await page.getByRole('button', { name: /Chat/i }).click()
  await expect(page.getByText('Audio and slides are clear.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reply' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Hide' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Notify' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'End' })).toBeVisible()
  await page.screenshot({ path: 'artifacts/context-screenshots/professor-live-control-smoke.png', fullPage: true })

  await page.goto('/professor/changes')
  await expect(page.getByRole('heading', { name: 'Change Requests' })).toBeVisible()
  await expect(page.getByText('Limits and Continuity - National Focus')).toBeVisible()
  await page.getByRole('button', { name: 'approved' }).click()
  await expect(page.getByText('Add tangent-line example.')).toBeVisible()
  await page.getByRole('button', { name: 'rejected' }).click()
  await expect(page.getByText('Remove optimisation checkpoint')).toBeVisible()

  await page.goto('/professor/chat')
  await expect(page.getByRole('heading', { name: 'Professor Chat' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sara Benali' })).toBeVisible()
  await expect(page.locator('p').filter({ hasText: 'Can you review my final proof step?' })).toBeVisible()
  await page.getByRole('button', { name: 'pinned' }).click()
  await expect(page.getByRole('heading', { name: 'Sara Benali' })).toBeVisible()
  await page.getByRole('button', { name: 'all' }).click()
  await page.getByPlaceholder('Search conversations').fill('Youssef')
  await expect(page.getByRole('button', { name: /Youssef El Idrissi/ })).toBeVisible()

  browserErrors.assertClean()
})

test('student live schedule and room hydrate with VdoCipher, Kresco chat, and Q&A', async ({ page }) => {
  const browserErrors = collectCriticalBrowserErrors(page)
  await seedAuthenticatedUser(page, smokeUser)

  await page.goto('/live')
  await expect(page.getByRole('heading', { name: 'Live sessions' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Open Q&A: continuity and IVT' })).toBeVisible()

  await page.goto('/live/62')
  await expect(page.getByRole('heading', { name: 'Open Q&A: continuity and IVT' })).toBeVisible()
  await expect(page.getByTitle('Open Q&A: continuity and IVT live player')).toBeVisible()
  await expect(page.getByRole('button', { name: /Chat/i })).toBeVisible()
  await expect(page.getByText('Audio and slides are clear.')).toBeVisible()
  await page.getByRole('button', { name: /Q&A/i }).click()
  await expect(page.getByText('Can you repeat the IVT proof step?')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send question' })).toBeVisible()
  await page.screenshot({ path: 'artifacts/context-screenshots/student-live-room-smoke.png', fullPage: true })

  await page.goto('/live/63')
  await expect(page.getByRole('heading', { name: 'Recorded recap: function domains' })).toBeVisible()
  await page.getByRole('button', { name: /Q&A/i }).click()
  await expect(page.getByText('This session is not accepting new questions.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send question' })).toBeDisabled()

  browserErrors.assertClean()
})

test('vip student professor chat and locked basic student state hydrate', async ({ page }) => {
  const browserErrors = collectCriticalBrowserErrors(page)
  await seedAuthenticatedUser(page, smokeUser)

  await page.goto('/professor-chat')
  await expect(page.getByRole('heading', { name: 'Pr Ahmed Kamil' })).toBeVisible()
  await expect(page.getByText('Check the dominant term before cancelling.')).toBeVisible()
  await expect(page.getByRole('button', { name: /Pr Ahmed Kamil Mathematics You: Can you review my final proof step/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Pr Lina Berrada Physics/i })).toBeVisible()

  await page.getByRole('button', { name: /Pr Lina Berrada Physics/i }).click()
  await expect(page.locator('p').filter({ hasText: 'Pr Lina Berrada - Physics' })).toBeVisible()
  await expect(page.getByPlaceholder('Write your question...')).toBeVisible()

  await seedAuthenticatedUser(page, smokeBasicStudent)
  await page.route('**/api/professor/student-chat', async (route) => {
    await route.fulfill({
      json: { eligible: false, reason: 'VIP or Platinum access required for professor chat', offerings: [], conversations: [] },
    })
  })
  await page.goto('/professor-chat')
  await expect(page.getByText('VIP chat is locked')).toBeVisible()
  await expect(page.getByText('VIP or Platinum access required for professor chat')).toBeVisible()

  browserErrors.assertClean()
})
