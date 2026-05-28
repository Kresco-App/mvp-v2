# Kresco Frontend

## Current Runtime

- Framework: Next.js App Router.
- Main app directory: `frontend/app`.
- Shared components: `frontend/components`.
- API client: `frontend/lib/axios.js`.
- Backend base URL comes from `NEXT_PUBLIC_API_BASE_URL`.

## Local Development

```bash
npm install
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open:

```text
http://127.0.0.1:3000
```

## Current Verification

```bash
npm run lint
npm test
npm run build
```

## Current Product Surface

The frontend uses the Topic Workspace as the main learning room:

```text
Subject
-> Topic
-> TopicSection
-> TopicItem
-> TabContent
```

Revision content appears as normal path items inside the final topic section.
