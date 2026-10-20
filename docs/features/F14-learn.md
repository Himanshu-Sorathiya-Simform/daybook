# F14 Learn

18 Oct 2026 · @Himanshu

Learn is Daybook's library of short articles, news and guides about money. Content lives in Sanity, Daybook's hosted CMS, and appears on public pages anyone can read, logged in or not. The newest posts also show on the landing page and the dashboard, and post titles are searchable from the palette.

- **Reading:** pages read Sanity on the server.
- **Live updates:** pages update live when content changes, through Sanity's Live Content API, with no webhooks to configure on localhost.
- **Rich text:** rendered from Portable Text, never from raw HTML.
- **Content:** a seed script loads 12 sample posts, so the section is never empty.

| Item       | Value                                                                                                                                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Milestone  | M7. Access tiers (members and Premium posts) are Stretch (M8)                                                                                                                                                                                                                         |
| Plan       | Free and Premium; all core posts are public. Stretch: `learn.tiers` flag, `learn.premium.read` Premium code                                                                                                                                                                           |
| Depends on | [P2](../platform/P2-data-access-and-security.md) (CSP for Sanity, dynamic pages, the request clock), [P1](../platform/P1-offline-and-pwa.md) (page and image caching), [F01](F01-auth-and-account.md) (landing page), [F08](F08-dashboard.md) (widget), [F13](F13-search.md) (search) |
| Decisions  | D-57, D-157 to D-160, D-165, D-173, D-348 to D-353, D-378, D-382, D-385                                                                                                                                                                                                               |

## 1. User stories

- As a visitor, I want to read Daybook's articles without signing up.
- As a user, I want to browse by kind and topic, and find a post by its title.
- As a user, I want the newest posts on my dashboard, and to read posts I opened before while offline.
- As the content author, I want posts to appear on the site as soon as I publish them in Sanity.
- As a developer, I want sample content loaded with one command.

## 2. Scope

| In                                                                                                                                                                                                                                                                             | Stretch (M8)                                                                                                                                         | Out                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The post schema and the Sanity Studio; `/learn` with kind and topic filters, title search and paging; `/learn/[slug]`; the landing-page and dashboard lists; live updates; Portable Text rendering; Sanity images; the seed script; offline reading through the service worker | Members-only and Premium posts with dotted ids, read on the server with a token through a second client (D-157, `learn.tiers`, `learn.premium.read`) | Comments, likes or sharing; authoring inside Daybook; drafts and previews in the app (Sanity's Presentation tool); newsletters; full-text search of post bodies; localization; RSS |

## 3. Concepts and fields

**Post** (one Sanity document type, `post`; D-158, D-348)

| Field         | Meaning                                                                       | Rules                                                                                                                           | Example                                            |
| ------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `title`       | Headline                                                                      | Required, 1 to 100 characters                                                                                                   | "How to set your first Budget"                     |
| `slug`        | URL part                                                                      | Required, unique, lowercase letters, digits and hyphens, from the title                                                         | `how-to-set-your-first-budget`                     |
| `kind`        | `article`, `news` or `guide`                                                  | Required                                                                                                                        | `guide`                                            |
| `topics`      | One to three of `budgeting`, `saving`, `investing`, `debt`, `taxes`, `basics` | Required                                                                                                                        | `["budgeting", "basics"]`                          |
| `excerpt`     | One-line summary for lists and metadata                                       | Required, 1 to 200 characters                                                                                                   | "Pick one category, set a limit, check it weekly." |
| `cover`       | Image with `alt` text                                                         | Required; `alt` required, 1 to 150 characters                                                                                   |                                                    |
| `body`        | Portable Text                                                                 | Required. Styles: normal, h2, h3, blockquote. Lists: bullet and number. Marks: strong, em, code, link. Blocks: image with `alt` |                                                    |
| `author`      | Display name                                                                  | Required, 1 to 60 characters                                                                                                    | "Daybook team"                                     |
| `publishedAt` | When it goes live                                                             | Required; a post with a future `publishedAt` is not shown                                                                       | `2026-10-12T09:00:00Z`                             |

The Sanity Studio lives in `studio/` in the repository, with this schema and its validation, and is deployed to Sanity's hosted Studio (`npx sanity deploy`). Daybook never writes posts at runtime.

**Derived values**

- **Reading time:** the body's words ÷ 200, rounded up, at least 1: "4 min read".
- **The kind's label:** Article, News or Guide.
- **The topic's label:** Budgeting, Saving, Investing, Debt, Taxes or Basics.

## 4. Business rules

**Reading content (D-57, D-159, D-349, D-378)**

- **BR-F14-01** **Fetching.** Server components read Sanity through `next-sanity`, pinned to major version 13, which requires Next.js 16 and React 19.2. The client is set up once in `server/learn/client.ts`:
    - **Client options:** `projectId` and `dataset` from the environment, `useCdn: true`, a pinned `apiVersion` date, and no token, since posts are public.
    - **Time limit** (D-385): `timeout: 2000` and `maxRetries: 0`. Each `sanityFetch` makes two calls in a row, one for its sync tags and one for the result. So a read gives up after 2 seconds when Sanity hangs, and takes at most about 4 seconds when it is slow, never minutes.
    - **`defineLive`:** from `next-sanity/live`, with `serverToken: false` and `browserToken: false`. It returns `sanityFetch` and `<SanityLive />`.
    - **Tags:** `sanityFetch` still tags its reads, but Daybook uses no tag. With no Data Cache and `action="refresh"`, every live event refreshes every open Learn or landing page, whatever it changed (BR-F14-02's cost).
    - **No Data Cache** (D-378): in Daybook's setup (`cacheComponents` off), `sanityFetch` asks Next.js to keep its answer in the Data Cache until its tags are revalidated, and a router refresh never revalidates them. Next.js applies a segment's `fetchCache` only while that segment renders, and a soft navigation renders only the page. So every page or route file whose render calls `sanityFetch` exports `fetchCache = 'force-no-store'`: `app/learn/page.tsx`, `app/learn/[slug]/page.tsx`, the landing page, the dashboard page and `/api/search`. Each read then goes to Sanity's API CDN, and nothing piles up in the Data Cache.
- **BR-F14-02** **Live updates.** `<SanityLive action="refresh" />` sits in the Learn layout and the landing page, both server components. It is not inside any client widget (D-159).
    - **Refreshing:** a published change makes it call the client router's `refresh()`, which re-renders the page's server components with fresh reads. SRV-3 keeps every server call that changes state a route handler (D-173), and the default action, which revalidates cache tags, would be Daybook's only Server Action. next-sanity still bundles that action, but nothing calls it.
    - **Not on the dashboard** (D-385): each refresh there would re-run every dashboard prefetch. The Latest from Learn widget updates on the next load instead.
    - **The cost:** one re-render of each open Learn or landing page per published change, including about 12 for each `sanity:seed` run.
    - **After `goaway`:** Sanity closes a connection with `goaway` when the project's connection limit is reached. `onGoAway={false}` turns off the fallback that refreshes every 30 seconds, so such a page simply stops updating live. The event is reported through `onError`, which logs it to the console.
    - **The connection:** it connects from the browser to `<projectId>.api.sanity.io`, which P2's CSP allows. `APP_ORIGIN` is a CORS origin of the Sanity project, without credentials (BR-F14-14).
    - **Drafts:** draft mode and visual editing are not used.
- **BR-F14-03** **Published only.** Every query keeps documents of type `post` whose id contains no dot (`!(_id in path("*.**"))`) and whose `publishedAt` is not after `$now`. That excludes drafts (`drafts.<id>`), and leaves dotted ids free for the Stretch tiers.
    - **`$now`:** the request clock (P2, BR-P2-43), rounded down to the minute. Logged-out pages use the same clock without a user context. Requests within one minute send the same query, so Sanity's API CDN answers them from its cache.
    - **Comparing:** `dateTime(publishedAt) <= dateTime($now)`, so timestamps written in different formats still compare as instants.
    - **Scheduled posts:** appear from the first minute that starts at or after their `publishedAt`. A post published at 09:14:20 appears at 09:15:00, and one at exactly 09:14:00 appears at once.
- **BR-F14-04** **Rendering rich text.** `body` renders through `@portabletext/react` with Daybook's components for each style, list, mark and image. Raw HTML is never rendered (D-57).
    - **Links:** a link's `href` is checked as F01 checks `next` (BR-F01-09): either `https:` or `http:`, or a same-origin path that starts with a single `/`, with no backslash and not `//`. Any other link renders as plain text. External links open in a new tab with `rel="noopener noreferrer"`.
    - **Images:** an image with no `alt` is not rendered.
- **BR-F14-05** **Images.** Images are plain `<img>` elements with a `srcset` that `@sanity/image-url` builds from `cdn.sanity.io`:
    - **Sizes:** widths 400, 800 and 1200, with `auto=format`.
    - **Attributes:** `width` and `height` from the asset's dimensions, so nothing shifts; `crossorigin="anonymous"`, so the service worker can cache the CORS response (P1); `decoding="async"`.
    - **Loading:** lazy below the fold. The cover is the post page's largest image and is loaded eagerly.

    Sanity's CDN resizes them, and Next.js does not process them.

**Pages (D-350)**

- **BR-F14-06** **`/learn?kind=&topic=&q=&page=`** shows:
    - the title "Learn";
    - kind chips (All, Articles, News, Guides) and topic chips;
    - a title search field;
    - posts, newest `publishedAt` first, 12 at a time. Each shows its cover, kind, title, excerpt, date and reading time.

    **Paging:** "Load more" adds the next 12. The URL keeps `page` (1 to 50), so Back returns to the same place.

    **Invalid filters:** an unknown `kind` or `topic`, a `page` outside 1 to 50, or a `q` that fails BR-F14-07 is dropped with the FIL-5 notice.

    **Dates:** formatted on the server. For a signed-in user they use F02's day format. For a visitor they use the first locale of `Accept-Language` that `Intl` supports, else `en-US`, so server and client render the same text.

- **BR-F14-07** **Title search** (`q`). The query is trimmed and normalized, and must be 3 to 100 characters with no control characters.
    - **Terms:** each whitespace-separated word, with every character other than letters and digits removed. Empty words are dropped, and the first 10 are kept.
    - **Matching:** a post matches when every term begins a word of its title, through GROQ `title match $terms`, with each term followed by `*`. "budg first" finds "How to set your first Budget".
    - **Order and timing:** results keep the newest-first order. The field commits 300 ms after typing stops, as F03's does.
- **BR-F14-08** **`/learn/[slug]`** shows:
    - the kind, title, author, date and reading time;
    - the cover;
    - the body;
    - the sample-content note;
    - "More in Budgeting": up to 3 other posts sharing the first topic, newest first, read in its own Suspense boundary, so the page waits only for the post itself.

    An unknown, future or draft slug gives Next.js's 404 page. Metadata: `<title>` is the post's title with "· Daybook Learn", the description is the excerpt, and the Open Graph image is the cover at 1200 pixels.

- **BR-F14-09** **The sample-content note.** Every post page ends with "Daybook Learn posts are sample content written for this demo, not financial advice."
- **BR-F14-10** **Shells** (D-382). Learn pages render in the app shell for a signed-in user, and in the public shell (the landing page's header with Log in and Sign up) otherwise.
    - **Where:** `app/learn/layout.tsx` sits outside the `(app)` and `(public)` groups. It validates the session and renders the same shell component that `app/(app)/layout.tsx` or `app/(public)/layout.tsx` renders.
    - **The worker:** both shells mount `client/sw-bridge` (P1, BR-P1-03), so Learn pages register the service worker and warm their documents for visitors too.
    - **The proxy:** Learn is not a logged-in route, so the proxy's session redirects leave it alone. Only its offline-logout redirect applies (P2, BR-P2-29).

**Lists elsewhere (D-351)**

- **BR-F14-11** `latestPosts(limit)` returns the newest public posts. It is used in two places:
    - **The landing page:** 3 posts (F01, BR-F01-27).
    - **The dashboard page:** prefetches 3 into the hydrated query cache, under `['learn', 'latest']`, for the Latest from Learn widget (F08, BR-F08-05 and BR-F08-17). The widget reads that hydrated data and never fetches on the client.

    **Streaming** (D-385): on both pages, the Learn read sits in its own Suspense boundary, beside the database prefetch rather than after it. The rest of the page streams without waiting for Sanity, and the section shows its skeleton until the posts arrive.

    **Search:** F13's Learn group uses `searchLearn(q, limit)`, with BR-F14-07's matching.

    **Sanity unreachable:**
    - the landing section is hidden;
    - the dashboard widget shows "This could not be loaded.";
    - F13's Learn group comes back empty with `error: true` (F13, BR-F13-10).

**Offline (D-352)**

- **BR-F14-12** Learn follows P1's caching (BR-P1-05):
    - **Documents:** Learn documents are kept network-first in `pages`, at most 50 entries for 7 days, one per pathname. They count as private, since a signed-in user's copy holds the app shell, so they are wiped at logout and at a user switch.
    - **Images:** Sanity images are kept cache-first in `images` and are not wiped.
    - **Reading offline:** a post a visitor or user opened online stays readable offline, with its cover, until the next logout, user switch or 7 days. A page never opened shows `/offline`.
    - **The dashboard widget:** offline, it shows the posts held in the cached dashboard document, or in the saved query cache's Learn family (P1, BR-P1-11). With neither, it hides itself.
    - **Filters offline:** `pages` keeps one `/learn` document whatever its query string (P1, BR-P1-05). Offline, any `/learn` URL therefore opens that document with the filters it was rendered with. Its chips, search and Load more are disabled with the offline line until the connection returns (BR-P1-39).

**Seeding (D-160, D-353)**

- **BR-F14-13** `npm run sanity:seed` loads 12 sample posts from `seed/learn/posts.json` and their images from `seed/learn/images/`, through a write token in `SANITY_WRITE_TOKEN`, which only the script reads.
    - **The mix:** 5 articles, 3 news posts and 4 guides, covering every topic, with `publishedAt` spread over the 60 days before the run.
    - **Fixed ids:** each post has a fixed `_id` (`post-how-to-set-your-first-budget`), so running it again updates, never duplicates. `--reset` deletes every `post-*` document first.
    - **Images:** uploaded once, keyed by file name.
- **BR-F14-14** **Setup steps.** Printed by the seed script, and listed in the README:
    1. create the Sanity project (free plan) and a public `production` dataset;
    2. add `APP_ORIGIN` to its CORS origins without credentials;
    3. create a write token for seeding;
    4. deploy the Studio.

## 5. Calculations

**Reading time.** A body of 730 words reads in ⌈730 ÷ 200⌉ = 4 minutes ("4 min read"). One of 150 words reads in 1 minute, the minimum.

**`$now`.** A request at 09:14:37.512 UTC queries with `$now` = 09:14:00 UTC. A post published at 09:14:20 is hidden until 09:15:00, when `$now` first reaches it.

No other figures. Learn shows no money.

## 6. Screens and states

**`/learn`** (BR-F14-06) and **`/learn/[slug]`** (BR-F14-08).

| State            | What the user sees                                                                  |
| ---------------- | ----------------------------------------------------------------------------------- |
| Loading          | Skeleton cards with fixed image ratios (16:9), so nothing shifts                    |
| Empty            | "No posts yet." with no filter; "No posts match these filters." with Clear filters  |
| Error            | "Learn could not be loaded." with Retry                                             |
| Offline          | Posts opened before, from the worker's cache (BR-F14-12); otherwise `/offline` (P1) |
| Pending          | n/a                                                                                 |
| Locked (Premium) | n/a in the core                                                                     |
| Read-only        | Always: Learn has no writes                                                         |

## 7. Flows

**7.1 A visitor reads a guide.** Logged out, the visitor opens `/`, sees the 3 latest posts, and selects one. `/learn/how-to-set-your-first-budget` renders in the public shell.

**7.2 Live update.** The author fixes a typo in Sanity's Studio and publishes. A reader with the post open sees the corrected text after the router refresh, without reloading: the refresh reads Sanity again, since no Learn read is kept in the Data Cache. If Sanity's live connection fails, the page keeps its content until the next navigation.

**7.3 Find by title.** A user types `l:budg` in the palette (F13). The Learn group lists "How to set your first Budget". "See all in Learn" opens `/learn?q=budg`.

**7.4 Offline reading.** A user who read two guides yesterday opens one on a flight. The worker serves the saved document, and its cover from `images`.

## 8. Validation and messages

| Situation                 | Message shown                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------- |
| Invalid filter in the URL | Some filters in this link weren't valid and were removed.                           |
| No posts                  | No posts yet.                                                                       |
| No matches                | No posts match these filters.                                                       |
| Search too short          | Type at least 3 characters to search.                                               |
| Load failure              | Learn could not be loaded.                                                          |
| Sample note               | Daybook Learn posts are sample content written for this demo, not financial advice. |
| Reading time              | 4 min read                                                                          |

## 9. Plan gating

None in the core: every post is public. The Stretch tiers add `learn.tiers` (flag) and `learn.premium.read` (Premium). Gated posts are read on the server by a second Sanity client with `SANITY_READ_TOKEN` (D-157), since `defineLive` without a token reads published public documents only.

## 10. Offline behavior

BR-F14-12. Learn has no writes.

## 11. Server surface

No API routes. Learn is server components, and the server functions in `server/learn`, each through `sanityFetch`:

- `latestPosts(limit)`;
- `searchLearn(q, limit)`;
- `postsPage(filter, page)`;
- `postBySlug(slug)`.

**Environment.**

- `SANITY_PROJECT_ID` and `SANITY_DATASET` (root 13).
- `SANITY_WRITE_TOKEN`, read only by `sanity:seed`.
- `SANITY_READ_TOKEN`, unused until the Stretch tiers.
- The two tokens are optional at startup (P2, BR-P2-38).

## 12. Cross-feature effects

- **F01:** the landing page's 3 latest posts, in a Suspense boundary, with `fetchCache = 'force-no-store'` and its `<SanityLive />` (F01, BR-F01-27).
- **F08:** the dashboard page prefetches the widget's posts in a Suspense boundary, without `<SanityLive />`. The widget joins the registry at M7, and normalization appends it to stored layouts (F08, BR-F08-20).
- **F13:** the Learn chip and group appear at M7. See all opens `/learn?q=`.
- **P1:** keeps Learn documents in `pages`, Sanity images in `images`, and the dashboard's latest posts in the saved query cache; both shells register the worker.
- **P2:** the CSP already allows Sanity's API, its live endpoint and `cdn.sanity.io`. Learn uses the request clock.
- **P3:** Learn pages are part of the accessibility pass and the LCP run. The Studio's packages, peers of next-sanity, are in the dependency audit.

## 13. Edge cases

- **A post unpublished while someone reads it:** live updates remove it from lists, and the open page shows the 404 on its next refresh.
- **Sanity's free plan limits reached:** reads fail and the pages show their error state. The plan never bills (verification.md).
- **A slug changed in Sanity:** the old URL gives 404.
- **A link with `javascript:`, `//evil.example` or `/\evil.example`:** rendered as text (BR-F14-04).
- **A future `publishedAt`:** hidden until the first minute that starts at or after it (BR-F14-03).
- **Sanity slow or down:** each call gives up after 2 seconds. The landing section hides, the dashboard widget shows its error line, and F13's Learn group comes back with `error: true`, while the rest of each page has already rendered.
- **A very long title:** clamped to two lines in lists, in full on its page.

## 14. Acceptance criteria

- **AC-F14-01** (integration, Sanity client mocked) `postsPage` returns published posts only, newest first, 12 per page, excluding drafts, future posts and dotted ids. It passes `$now` rounded down to the minute.
- **AC-F14-02** (unit) Title matching:
    - "budg first" matches "How to set your first Budget";
    - "udge" does not;
    - "budg*!" is cleaned to "budg".
- **AC-F14-03** (unit) Portable Text rendering:
    - `https:` and `/learn/x` links render as links;
    - `javascript:`, `//evil.example` and `/\evil.example` render as text;
    - an image without `alt` is skipped;
    - a raw HTML string in a block renders as text.
- **AC-F14-04** (unit) Reading time: 730 words gives 4 minutes, and 150 words gives 1.
- **AC-F14-05** (integration, tag `@sanity`) `sanity:seed` run twice leaves exactly 12 `post-*` documents. `--reset` reloads them.
- **AC-F14-06** (E2E, tag `@sanity`) Logged out, `/learn` lists 12 posts, the Guides chip leaves 4, and opening one shows the sample-content note.
- **AC-F14-07** (E2E, production build, tag `@sanity`):
    - signed in, a post opened online is readable offline with its cover, and is gone from the cache after logout;
    - logged out, a visitor's first visit to a post registers the worker, and the post is readable offline afterwards.
- **AC-F14-08** (integration, Sanity client mocked):
    - the dashboard page's prefetch holds 3 posts;
    - with Sanity failing, the widget shows its error line and the landing page omits the section;
    - with Sanity hanging, the dashboard's other widgets render first, and the Learn read gives up after 2 seconds.
- **AC-F14-09** (accessibility) `/learn` and a post page pass axe with no serious or critical violations. Headings descend in order, and every image has alternative text.
- **AC-F14-10** (performance) `/learn/[slug]` meets LCP 2.5 s or less in P3's browser measures.
- **AC-F14-11** (E2E, tag `@sanity`) Live updates:
    - with a post open, publishing a title change in Sanity shows the new title without a reload, even though another request read the same post earlier that minute;
    - no request carrying a `Next-Action` header is sent;
    - after a soft navigation from `/learn` to a post, then a publish of that post's title, a second soft navigation to it in the same minute shows the new title;
    - every page or route file that calls `sanityFetch` exports `fetchCache = 'force-no-store'`, and the dashboard page renders no `<SanityLive />`.
- **AC-F14-12** (integration) An unknown, draft or future slug gives 404. A `/learn` URL with `kind=video`, `page=99` or `q=ab` drops it with the FIL-5 notice.

## 15. Illustrations

Illustrative, the post query:

```ts
const postsPageQuery = defineQuery(`
  *[_type == "post" && !(_id in path("*.**"))
    && dateTime(publishedAt) <= dateTime($now)
    && (!defined($kind) || kind == $kind)
    && (!defined($topic) || $topic in topics)
    && (!defined($terms) || title match $terms)]
  | order(publishedAt desc) [$start...$end] {
    "slug": slug.current, title, kind, topics, excerpt, publishedAt,
    cover { alt, asset->{ _id, metadata { dimensions } } }
  }`);
```
