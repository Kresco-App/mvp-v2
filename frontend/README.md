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

For subdomain routing, use one dev server and either:

```text
http://kresco.test:3000
http://app.kresco.test:3000
http://admin.kresco.test:3000
http://prof.kresco.test:3000
http://staff.kresco.test:3000
```

after adding the matching hosts-file entries to `127.0.0.1`, or use the no-hosts-file fallback:

```text
http://kresco.lvh.me:3000
http://app.kresco.lvh.me:3000
http://admin.kresco.lvh.me:3000
http://prof.kresco.lvh.me:3000
http://staff.kresco.lvh.me:3000
```

Validate the mirror with `npm run check:local-subdomains:kresco-test` or `npm run check:local-subdomains` after the dev server is running.

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
