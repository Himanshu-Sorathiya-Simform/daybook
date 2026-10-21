---
paths:
    - "app/**"
    - "proxy.ts"
    - "next.config.ts"
---

# Next.js 16 in this repo

## Use this in Next 16

- Await request values: `await cookies()`, `await headers()`, `await props.params`, `await props.searchParams`. Synchronous access is gone. Type pages with the generated `PageProps`, `LayoutProps` and `RouteContext`, which exist after `pnpm typecheck` runs `next typegen`.
- The request hook is `proxy.ts` at the repo root, beside `app/`, exporting a function named `proxy`. It replaces `middleware.ts` and always runs on Node.js. Its jobs and matcher are in `docs/platform/P2-data-access-and-security.md` (BR-P2-28 to BR-P2-32).
- Lint with `eslint` directly (`pnpm lint`). `next lint` and the `eslint` key in the Next config no longer exist.
- Read settings from environment variables. `serverRuntimeConfig` and `publicRuntimeConfig` no longer exist.
- Allow remote images with `images.remotePatterns`, which replaces `images.domains`.
- Turbopack is the default bundler. Its settings are the top-level `turbopack` key, which replaces `experimental.turbopack`.

## Pages and routes

- Every page renders dynamically (BR-P2-35): the root layout reads `x-nonce` from `headers()`. Don't add static generation, `generateStaticParams`, `revalidate` or ISR to a page.
- `page.tsx`, `layout.tsx` and `route.ts` stay thin. They may prefetch data and compose feature components, and hold no business logic. That lives in `src/features` and `src/server`.
- Every server-only module starts with `import 'server-only'`.

## Config and the dev server

- Ask me before changing `next.config.ts`, and state the reason.
- Before checking anything in a running app, read `.next/dev/lock`. If a dev server runs, reuse it. If not, start `pnpm dev` in the background, never the foreground, and stop it when you are done if you started it.
