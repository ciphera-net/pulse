/**
 * @file Integration guide content — full JSX guide for every supported platform.
 *
 * Each guide is keyed by the integration slug and rendered on the
 * `/integrations/[slug]` page.
 *
 * * 75 guides across 7 categories.
 */

import { type ReactNode } from 'react'
import { CodeBlock } from '@/components/CodeBlock'

// * ─── Guide registry ─────────────────────────────────────────────────────────

const guides: Record<string, ReactNode> = {
  /* ────────────────────────────────────────────────────────────────────────────
   * 1. Next.js
   * ──────────────────────────────────────────────────────────────────────────── */
  'nextjs': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        The best way to add Pulse to your Next.js application is using the
        built-in <code>next/script</code> component.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Method 1: App Router</h3>
      <p>
        Add the Pulse script to your root layout so it loads on every page.
      </p>
      <CodeBlock filename="app/layout.tsx">{`import Script from 'next/script'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <Script
          defer
          src="https://pulse.ciphera.net/script.js"
          data-domain="your-site.com"
          strategy="afterInteractive"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}`}</CodeBlock>

      <h3>Method 2: Pages Router</h3>
      <p>
        If you&apos;re using the Pages Router, add the script to your custom{' '}
        <code>_app.tsx</code>.
      </p>
      <CodeBlock filename="pages/_app.tsx">{`import Script from 'next/script'
import type { AppProps } from 'next/app'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Script
        defer
        src="https://pulse.ciphera.net/script.js"
        data-domain="your-site.com"
        strategy="afterInteractive"
      />
      <Component {...pageProps} />
    </>
  )
}`}</CodeBlock>

      <h3>Configuration options</h3>
      <ul>
        <li><code>data-domain</code> &mdash; your site&apos;s domain (without <code>https://</code>)</li>
        <li><code>src</code> &mdash; the Pulse script URL</li>
        <li><code>strategy=&quot;afterInteractive&quot;</code> &mdash; loads the script after the page becomes interactive</li>
      </ul>

      <p>
        For more details, see the{' '}
        <a href="https://nextjs.org/docs/app/api-reference/components/script" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Next.js Script docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/react" className="text-brand-orange hover:underline">React</a>,{' '}
        <a href="/integrations/vercel" className="text-brand-orange hover:underline">Vercel</a>,{' '}
        <a href="/integrations/nuxt" className="text-brand-orange hover:underline">Nuxt</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 2. React
   * ──────────────────────────────────────────────────────────────────────────── */
  'react': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        For standard React SPAs, add the script to your <code>index.html</code>.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Method 1: index.html (Recommended)</h3>
      <p>
        The simplest approach is to add the Pulse script directly to your HTML
        entry point.
      </p>
      <CodeBlock filename="public/index.html">{`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <script
      defer
      data-domain="your-site.com"
      src="https://pulse.ciphera.net/script.js"
    ></script>

    <title>My React App</title>
</head>
<body>
    <div id="root"></div>
</body>
</html>`}</CodeBlock>

      <h3>Method 2: Programmatic injection via useEffect</h3>
      <p>
        If you prefer to inject the script programmatically (e.g. only in
        production), use a <code>useEffect</code> hook.
      </p>
      <CodeBlock filename="src/App.tsx">{`import { useEffect } from 'react'

function App() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      const script = document.createElement('script')
      script.defer = true
      script.setAttribute('data-domain', 'your-site.com')
      script.src = 'https://pulse.ciphera.net/script.js'
      document.head.appendChild(script)
    }
  }, [])

  return <div className="App"><h1>Hello World</h1></div>
}`}</CodeBlock>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/nextjs" className="text-brand-orange hover:underline">Next.js</a>,{' '}
        <a href="/integrations/remix" className="text-brand-orange hover:underline">Remix</a>,{' '}
        <a href="/integrations/gatsby" className="text-brand-orange hover:underline">Gatsby</a>,{' '}
        <a href="/integrations/preact" className="text-brand-orange hover:underline">Preact</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 3. Vue.js
   * ──────────────────────────────────────────────────────────────────────────── */
  'vue': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add the script to your <code>index.html</code> — works for both Vue CLI
        and Vite-based projects.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add the Pulse script to index.html</h3>
      <p>
        Both Vue CLI and Vite use an <code>index.html</code> as the entry point.
        Simply add the Pulse script inside the <code>&lt;head&gt;</code> tag.
      </p>
      <CodeBlock filename="index.html">{`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <script
      defer
      data-domain="your-site.com"
      src="https://pulse.ciphera.net/script.js"
    ></script>

    <title>My Vue App</title>
</head>
<body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
</body>
</html>`}</CodeBlock>

      <p>
        Looking for Nuxt? Check the dedicated{' '}
        <a href="/integrations/nuxt" className="text-brand-orange hover:underline">Nuxt guide</a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/nuxt" className="text-brand-orange hover:underline">Nuxt</a>,{' '}
        <a href="/integrations/vitepress" className="text-brand-orange hover:underline">VitePress</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 4. Angular
   * ──────────────────────────────────────────────────────────────────────────── */
  'angular': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add the script to your <code>src/index.html</code> — the single entry
        point for all Angular applications.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add the Pulse script to index.html</h3>
      <p>
        Place the Pulse script inside the <code>&lt;head&gt;</code> tag of your
        Angular app&apos;s <code>src/index.html</code>.
      </p>
      <CodeBlock filename="src/index.html">{`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">

  <script
    defer
    data-domain="your-site.com"
    src="https://pulse.ciphera.net/script.js"
  ></script>

  <title>My Angular App</title>
  <base href="/">
</head>
<body>
  <app-root></app-root>
</body>
</html>`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://angular.dev/guide/components" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Angular docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/react" className="text-brand-orange hover:underline">React</a>,{' '}
        <a href="/integrations/vue" className="text-brand-orange hover:underline">Vue.js</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 5. Svelte
   * ──────────────────────────────────────────────────────────────────────────── */
  'svelte': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add the script to your <code>index.html</code> for Vite-based Svelte, or
        use <code>&lt;svelte:head&gt;</code> in SvelteKit.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Method 1: Svelte (Vite)</h3>
      <p>
        For standard Svelte projects using Vite, add the Pulse script to your{' '}
        <code>index.html</code>.
      </p>
      <CodeBlock filename="index.html">{`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <script
      defer
      data-domain="your-site.com"
      src="https://pulse.ciphera.net/script.js"
    ></script>

    <title>My Svelte App</title>
</head>
<body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
</body>
</html>`}</CodeBlock>

      <h3>Method 2: SvelteKit</h3>
      <p>
        In SvelteKit, use <code>&lt;svelte:head&gt;</code> in your root layout
        to add the script to every page.
      </p>
      <CodeBlock filename="src/routes/+layout.svelte">{`<svelte:head>
  <script
    defer
    data-domain="your-site.com"
    src="https://pulse.ciphera.net/script.js"
  ></script>
</svelte:head>

<slot />`}</CodeBlock>

      <p>
        Alternatively, you can add the script directly to{' '}
        <code>src/app.html</code> in your SvelteKit project.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/astro" className="text-brand-orange hover:underline">Astro</a>,{' '}
        <a href="/integrations/vue" className="text-brand-orange hover:underline">Vue.js</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 6. Nuxt
   * ──────────────────────────────────────────────────────────────────────────── */
  'nuxt': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Configure Pulse analytics in your <code>nuxt.config</code> for a
        framework-native setup.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Method 1: Nuxt 3</h3>
      <p>
        Add the Pulse script via the <code>app.head</code> option in your Nuxt 3
        config.
      </p>
      <CodeBlock filename="nuxt.config.ts">{`export default defineNuxtConfig({
  app: {
    head: {
      script: [
        {
          defer: true,
          'data-domain': 'your-site.com',
          src: 'https://pulse.ciphera.net/script.js',
        },
      ],
    },
  },
})`}</CodeBlock>

      <h3>Method 2: Nuxt 2</h3>
      <p>
        In Nuxt 2, use the <code>head</code> property in your config.
      </p>
      <CodeBlock filename="nuxt.config.js">{`export default {
  head: {
    script: [
      {
        defer: true,
        'data-domain': 'your-site.com',
        src: 'https://pulse.ciphera.net/script.js',
      },
    ],
  },
}`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://nuxt.com/docs/api/nuxt-config#head" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Nuxt head config docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/vue" className="text-brand-orange hover:underline">Vue.js</a>,{' '}
        <a href="/integrations/nextjs" className="text-brand-orange hover:underline">Next.js</a>,{' '}
        <a href="/integrations/vitepress" className="text-brand-orange hover:underline">VitePress</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 7. Remix
   * ──────────────────────────────────────────────────────────────────────────── */
  'remix': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add the Pulse script to your <code>app/root.tsx</code> so it&apos;s
        included on every route.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add script to app/root.tsx</h3>
      <p>
        The root route is the top-level layout in Remix. Add the Pulse script
        inside the <code>&lt;head&gt;</code> section.
      </p>
      <CodeBlock filename="app/root.tsx">{`import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from '@remix-run/react'

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <script
          defer
          data-domain="your-site.com"
          src="https://pulse.ciphera.net/script.js"
        />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://remix.run/docs/en/main/file-conventions/root" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Remix root docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/react" className="text-brand-orange hover:underline">React</a>,{' '}
        <a href="/integrations/nextjs" className="text-brand-orange hover:underline">Next.js</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 8. Astro
   * ──────────────────────────────────────────────────────────────────────────── */
  'astro': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add the Pulse script to your base layout so it&apos;s included on every
        page of your Astro site.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add to your base layout</h3>
      <p>
        Place the Pulse script in the <code>&lt;head&gt;</code> of your shared
        layout component.
      </p>
      <CodeBlock filename="src/layouts/BaseLayout.astro">{`---
interface Props {
  title: string
}

const { title } = Astro.props
---

<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <script
      defer
      data-domain="your-site.com"
      src="https://pulse.ciphera.net/script.js"
    ></script>

    <title>{title}</title>
</head>
<body>
    <slot />
</body>
</html>`}</CodeBlock>

      <p>
        If you&apos;re using Astro&apos;s View Transitions, the script will
        persist across navigations by default since it&apos;s in the{' '}
        <code>&lt;head&gt;</code>.
      </p>

      <p>
        For more details, see the{' '}
        <a href="https://docs.astro.build/en/guides/client-side-scripts/" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Astro scripts docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/svelte" className="text-brand-orange hover:underline">Svelte</a>,{' '}
        <a href="/integrations/hugo" className="text-brand-orange hover:underline">Hugo</a>,{' '}
        <a href="/integrations/eleventy" className="text-brand-orange hover:underline">Eleventy</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 9. Solid.js
   * ──────────────────────────────────────────────────────────────────────────── */
  'solidjs': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add the Pulse script to your <code>index.html</code> like any Vite-based
        project.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add the Pulse script to index.html</h3>
      <p>
        Solid.js uses Vite under the hood, so simply add the Pulse script to
        your HTML entry file.
      </p>
      <CodeBlock filename="index.html">{`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <script
      defer
      data-domain="your-site.com"
      src="https://pulse.ciphera.net/script.js"
    ></script>

    <title>My Solid App</title>
</head>
<body>
    <div id="root"></div>
    <script type="module" src="/src/index.tsx"></script>
</body>
</html>`}</CodeBlock>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/react" className="text-brand-orange hover:underline">React</a>,{' '}
        <a href="/integrations/qwik" className="text-brand-orange hover:underline">Qwik</a>,{' '}
        <a href="/integrations/preact" className="text-brand-orange hover:underline">Preact</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 10. Qwik
   * ──────────────────────────────────────────────────────────────────────────── */
  'qwik': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add the Pulse script to your root entry component so it loads on every
        page.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add to src/root.tsx</h3>
      <p>
        In Qwik, add the Pulse script to the <code>&lt;head&gt;</code> section
        of your root component.
      </p>
      <CodeBlock filename="src/root.tsx">{`import { component$ } from '@builder.io/qwik'
import { QwikCityProvider, RouterOutlet } from '@builder.io/qwik-city'

export default component$(() => {
  return (
    <QwikCityProvider>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script
          defer
          data-domain="your-site.com"
          src="https://pulse.ciphera.net/script.js"
        />
      </head>
      <body>
        <RouterOutlet />
      </body>
    </QwikCityProvider>
  )
})`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://qwik.dev/docs/advanced/containers/" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Qwik docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/react" className="text-brand-orange hover:underline">React</a>,{' '}
        <a href="/integrations/solidjs" className="text-brand-orange hover:underline">Solid.js</a>,{' '}
        <a href="/integrations/astro" className="text-brand-orange hover:underline">Astro</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 11. Preact
   * ──────────────────────────────────────────────────────────────────────────── */
  'preact': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add the Pulse script to your <code>index.html</code> like any Vite or
        HTML project.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add the Pulse script to index.html</h3>
      <p>
        Preact&apos;s setup is identical to any Vite-based project. Add the
        script to your entry HTML file.
      </p>
      <CodeBlock filename="index.html">{`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <script
      defer
      data-domain="your-site.com"
      src="https://pulse.ciphera.net/script.js"
    ></script>

    <title>My Preact App</title>
</head>
<body>
    <div id="app"></div>
    <script type="module" src="/src/index.tsx"></script>
</body>
</html>`}</CodeBlock>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/react" className="text-brand-orange hover:underline">React</a>,{' '}
        <a href="/integrations/solidjs" className="text-brand-orange hover:underline">Solid.js</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 12. HTMX
   * ──────────────────────────────────────────────────────────────────────────── */
  'htmx': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Since HTMX is used with server-rendered HTML, add the Pulse script to
        your server&apos;s base template.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add to your base HTML template</h3>
      <p>
        HTMX works with any backend — Django, Flask, Laravel, Rails, Express,
        and more. Add the Pulse script to whichever base template your server
        renders.
      </p>
      <CodeBlock filename="base.html">{`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <script
      defer
      data-domain="your-site.com"
      src="https://pulse.ciphera.net/script.js"
    ></script>

    <script src="https://unpkg.com/htmx.org"></script>
    <title>My HTMX App</title>
</head>
<body>
    <!-- Your HTMX-powered content -->
</body>
</html>`}</CodeBlock>

      <p>
        See the backend-specific guides for template syntax details:{' '}
        <a href="/integrations/django" className="text-brand-orange hover:underline">Django</a>,{' '}
        <a href="/integrations/flask" className="text-brand-orange hover:underline">Flask</a>,{' '}
        <a href="/integrations/laravel" className="text-brand-orange hover:underline">Laravel</a>,{' '}
        <a href="/integrations/rails" className="text-brand-orange hover:underline">Rails</a>,{' '}
        <a href="/integrations/express" className="text-brand-orange hover:underline">Express</a>.
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 13. Ember.js
   * ──────────────────────────────────────────────────────────────────────────── */
  'ember': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add the Pulse script to your <code>app/index.html</code>.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add the Pulse script to index.html</h3>
      <p>
        Ember uses <code>app/index.html</code> as its entry point. Add the
        script inside the <code>&lt;head&gt;</code> tag.
      </p>
      <CodeBlock filename="app/index.html">{`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">

    <script
      defer
      data-domain="your-site.com"
      src="https://pulse.ciphera.net/script.js"
    ></script>

    <title>My Ember App</title>

    {{content-for "head"}}
    <link integrity="" rel="stylesheet" href="{{rootURL}}assets/app.css">
</head>
<body>
    {{content-for "body"}}
    <script src="{{rootURL}}assets/vendor.js"></script>
    <script src="{{rootURL}}assets/app.js"></script>
</body>
</html>`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://guides.emberjs.com/release/" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Ember docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/react" className="text-brand-orange hover:underline">React</a>,{' '}
        <a href="/integrations/angular" className="text-brand-orange hover:underline">Angular</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 14. Laravel
   * ──────────────────────────────────────────────────────────────────────────── */
  'laravel': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add the Pulse script to your Blade layout template with a production
        guard.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add to your Blade layout</h3>
      <p>
        Use Laravel&apos;s <code>@production</code> directive to only load the
        script in production.
      </p>
      <CodeBlock filename="resources/views/layouts/app.blade.php">{`<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">

    @production
    <script
      defer
      data-domain="your-site.com"
      src="https://pulse.ciphera.net/script.js"
    ></script>
    @endproduction

    <title>@yield('title')</title>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body>
    @yield('content')
</body>
</html>`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://laravel.com/docs/blade#the-production-directive" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Laravel @production docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/django" className="text-brand-orange hover:underline">Django</a>,{' '}
        <a href="/integrations/rails" className="text-brand-orange hover:underline">Rails</a>,{' '}
        <a href="/integrations/wordpress" className="text-brand-orange hover:underline">WordPress</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 15. Django
   * ──────────────────────────────────────────────────────────────────────────── */
  'django': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add the Pulse script to your base template with a debug guard.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add to your base template</h3>
      <p>
        Use Django&apos;s template tags to only load the script when{' '}
        <code>DEBUG</code> is <code>False</code>.
      </p>
      <CodeBlock filename="templates/base.html">{`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    {% if not debug %}
    <script
      defer
      data-domain="your-site.com"
      src="https://pulse.ciphera.net/script.js"
    ></script>
    {% endif %}

    <title>{% block title %}My Django App{% endblock %}</title>
</head>
<body>
    {% block content %}{% endblock %}
</body>
</html>`}</CodeBlock>

      <p>
        Make sure to pass <code>debug</code> to the template context via{' '}
        <code>settings.DEBUG</code>, or use a context processor to make it
        available globally.
      </p>

      <p>
        For more details, see the{' '}
        <a href="https://docs.djangoproject.com/en/stable/ref/templates/builtins/" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Django template docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/flask" className="text-brand-orange hover:underline">Flask</a>,{' '}
        <a href="/integrations/laravel" className="text-brand-orange hover:underline">Laravel</a>,{' '}
        <a href="/integrations/htmx" className="text-brand-orange hover:underline">HTMX</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 16. Ruby on Rails
   * ──────────────────────────────────────────────────────────────────────────── */
  'rails': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add the Pulse script to your application layout with a production
        environment guard.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add to your application layout</h3>
      <p>
        Use an <code>if</code> guard to only load the script in production.
      </p>
      <CodeBlock filename="app/views/layouts/application.html.erb">{`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">

  <% if Rails.env.production? %>
  <script
    defer
    data-domain="your-site.com"
    src="https://pulse.ciphera.net/script.js"
  ></script>
  <% end %>

  <title><%= yield(:title) || "My Rails App" %></title>
  <%= csrf_meta_tags %>
  <%= stylesheet_link_tag "application" %>
</head>
<body>
  <%= yield %>
</body>
</html>`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://guides.rubyonrails.org/layouts_and_rendering.html" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Rails layout docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/laravel" className="text-brand-orange hover:underline">Laravel</a>,{' '}
        <a href="/integrations/django" className="text-brand-orange hover:underline">Django</a>,{' '}
        <a href="/integrations/jekyll" className="text-brand-orange hover:underline">Jekyll</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 17. Flask
   * ──────────────────────────────────────────────────────────────────────────── */
  'flask': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add the Pulse script to your Jinja2 base template with a debug guard.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add to your base template</h3>
      <p>
        Use Jinja2&apos;s conditional to only load the script when{' '}
        <code>DEBUG</code> is off.
      </p>
      <CodeBlock filename="templates/base.html">{`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    {% if not config.DEBUG %}
    <script
      defer
      data-domain="your-site.com"
      src="https://pulse.ciphera.net/script.js"
    ></script>
    {% endif %}

    <title>{% block title %}My Flask App{% endblock %}</title>
</head>
<body>
    {% block content %}{% endblock %}
</body>
</html>`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://flask.palletsprojects.com/en/stable/patterns/templateinheritance/" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Flask template docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/django" className="text-brand-orange hover:underline">Django</a>,{' '}
        <a href="/integrations/htmx" className="text-brand-orange hover:underline">HTMX</a>,{' '}
        <a href="/integrations/express" className="text-brand-orange hover:underline">Express</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 18. Express
   * ──────────────────────────────────────────────────────────────────────────── */
  'express': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add the Pulse script to your template engine&apos;s layout (EJS, Pug,
        Handlebars) or serve it via static HTML.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Method 1: EJS template</h3>
      <p>
        If you use EJS as your template engine, add the script to your layout
        with a production guard.
      </p>
      <CodeBlock filename="views/layout.ejs">{`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <% if (process.env.NODE_ENV === 'production') { %>
    <script
      defer
      data-domain="your-site.com"
      src="https://pulse.ciphera.net/script.js"
    ></script>
    <% } %>

    <title><%= title %></title>
</head>
<body>
    <%- body %>
</body>
</html>`}</CodeBlock>

      <h3>Method 2: Static HTML</h3>
      <p>
        If you serve static HTML files via Express, add the script directly.
      </p>
      <CodeBlock filename="public/index.html">{`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <script
      defer
      data-domain="your-site.com"
      src="https://pulse.ciphera.net/script.js"
    ></script>

    <title>My Express App</title>
</head>
<body>
    <h1>Hello World</h1>
</body>
</html>`}</CodeBlock>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/flask" className="text-brand-orange hover:underline">Flask</a>,{' '}
        <a href="/integrations/nextjs" className="text-brand-orange hover:underline">Next.js</a>,{' '}
        <a href="/integrations/react" className="text-brand-orange hover:underline">React</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 19. Gatsby
   * ──────────────────────────────────────────────────────────────────────────── */
  'gatsby': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Use the Gatsby SSR API or the Gatsby Head API to add Pulse to your site.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Method 1: gatsby-ssr.js</h3>
      <p>
        Use the <code>onRenderBody</code> hook to inject the Pulse script into
        every page&apos;s <code>&lt;head&gt;</code>.
      </p>
      <CodeBlock filename="gatsby-ssr.js">{`import React from "react"

export const onRenderBody = ({ setHeadComponents }) => {
  setHeadComponents([
    <script
      key="pulse-analytics"
      defer
      data-domain="your-site.com"
      src="https://pulse.ciphera.net/script.js"
    />,
  ])
}`}</CodeBlock>

      <h3>Method 2: Gatsby Head API (v4.19+)</h3>
      <p>
        If you&apos;re on Gatsby 4.19 or later, you can use the Head export in
        any page or template component.
      </p>
      <CodeBlock filename="src/pages/index.tsx">{`import React from "react"

export function Head() {
  return (
    <script
      defer
      data-domain="your-site.com"
      src="https://pulse.ciphera.net/script.js"
    />
  )
}

export default function IndexPage() {
  return <h1>Hello World</h1>
}`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://www.gatsbyjs.com/docs/reference/built-in-components/gatsby-head/" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Gatsby Head API docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/react" className="text-brand-orange hover:underline">React</a>,{' '}
        <a href="/integrations/nextjs" className="text-brand-orange hover:underline">Next.js</a>,{' '}
        <a href="/integrations/hugo" className="text-brand-orange hover:underline">Hugo</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 20. Hugo
   * ──────────────────────────────────────────────────────────────────────────── */
  'hugo': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add the Pulse script via a Hugo partial or directly in your base
        template.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Method 1: Create a partial</h3>
      <p>
        Create an analytics partial with a production guard using Hugo&apos;s{' '}
        <code>.Site.IsServer</code> flag.
      </p>
      <CodeBlock filename="layouts/partials/analytics.html">{`{{ if not .Site.IsServer }}
<script
  defer
  data-domain="your-site.com"
  src="https://pulse.ciphera.net/script.js"
></script>
{{ end }}`}</CodeBlock>

      <h3>Method 2: Include the partial in your base layout</h3>
      <p>
        Add the partial to your <code>baseof.html</code> layout.
      </p>
      <CodeBlock filename="layouts/_default/baseof.html">{`<!DOCTYPE html>
<html lang="{{ .Site.Language }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    {{ partial "analytics.html" . }}
    <title>{{ .Title }}</title>
</head>
<body>
    {{ block "main" . }}{{ end }}
</body>
</html>`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://gohugo.io/templates/partials/" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Hugo partials docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/jekyll" className="text-brand-orange hover:underline">Jekyll</a>,{' '}
        <a href="/integrations/eleventy" className="text-brand-orange hover:underline">Eleventy</a>,{' '}
        <a href="/integrations/astro" className="text-brand-orange hover:underline">Astro</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 21. Eleventy
   * ──────────────────────────────────────────────────────────────────────────── */
  'eleventy': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add the Pulse script to your base Nunjucks or Liquid layout.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add to your base layout</h3>
      <p>
        Place the Pulse script inside the <code>&lt;head&gt;</code> of your
        shared base template.
      </p>
      <CodeBlock filename="src/_includes/base.njk">{`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <script
      defer
      data-domain="your-site.com"
      src="https://pulse.ciphera.net/script.js"
    ></script>

    <title>{{ title }}</title>
</head>
<body>
    {{ content | safe }}
</body>
</html>`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://www.11ty.dev/docs/layouts/" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Eleventy layouts docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/hugo" className="text-brand-orange hover:underline">Hugo</a>,{' '}
        <a href="/integrations/jekyll" className="text-brand-orange hover:underline">Jekyll</a>,{' '}
        <a href="/integrations/astro" className="text-brand-orange hover:underline">Astro</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 22. Jekyll
   * ──────────────────────────────────────────────────────────────────────────── */
  'jekyll': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add the Pulse script to your default layout or an <code>_includes</code>{' '}
        partial.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Method 1: Create an analytics include</h3>
      <p>
        Create a reusable include with a production environment guard.
      </p>
      <CodeBlock filename="_includes/analytics.html">{`{% if jekyll.environment == "production" %}
<script
  defer
  data-domain="your-site.com"
  src="https://pulse.ciphera.net/script.js"
></script>
{% endif %}`}</CodeBlock>

      <h3>Method 2: Include in your default layout</h3>
      <p>
        Reference the include in your default layout&apos;s{' '}
        <code>&lt;head&gt;</code>.
      </p>
      <CodeBlock filename="_layouts/default.html">{`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    {% include analytics.html %}
    <title>{{ page.title }}</title>
</head>
<body>
    {{ content }}
</body>
</html>`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://jekyllrb.com/docs/includes/" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Jekyll includes docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/hugo" className="text-brand-orange hover:underline">Hugo</a>,{' '}
        <a href="/integrations/eleventy" className="text-brand-orange hover:underline">Eleventy</a>,{' '}
        <a href="/integrations/github-pages" className="text-brand-orange hover:underline">GitHub Pages</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 23. Docusaurus
   * ──────────────────────────────────────────────────────────────────────────── */
  'docusaurus': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add the Pulse script via the <code>scripts</code> array in your
        Docusaurus config.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Configure in docusaurus.config.js</h3>
      <p>
        Docusaurus supports a <code>scripts</code> config option that injects
        script tags into every page.
      </p>
      <CodeBlock filename="docusaurus.config.js">{`module.exports = {
  scripts: [
    {
      src: 'https://pulse.ciphera.net/script.js',
      defer: true,
      'data-domain': 'your-site.com',
    },
  ],
  // ... rest of config
}`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://docusaurus.io/docs/api/docusaurus-config#scripts" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Docusaurus scripts config docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/vitepress" className="text-brand-orange hover:underline">VitePress</a>,{' '}
        <a href="/integrations/mkdocs" className="text-brand-orange hover:underline">MkDocs</a>,{' '}
        <a href="/integrations/gatsby" className="text-brand-orange hover:underline">Gatsby</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 24. VitePress
   * ──────────────────────────────────────────────────────────────────────────── */
  'vitepress': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add the Pulse script via VitePress&apos;s <code>head</code> config
        option.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Configure in .vitepress/config.ts</h3>
      <p>
        VitePress lets you inject tags into the <code>&lt;head&gt;</code> of
        every page via the <code>head</code> array.
      </p>
      <CodeBlock filename=".vitepress/config.ts">{`import { defineConfig } from 'vitepress'

export default defineConfig({
  head: [
    [
      'script',
      {
        defer: '',
        'data-domain': 'your-site.com',
        src: 'https://pulse.ciphera.net/script.js',
      },
    ],
  ],
})`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://vitepress.dev/reference/site-config#head" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          VitePress head config docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/docusaurus" className="text-brand-orange hover:underline">Docusaurus</a>,{' '}
        <a href="/integrations/vue" className="text-brand-orange hover:underline">Vue.js</a>,{' '}
        <a href="/integrations/nuxt" className="text-brand-orange hover:underline">Nuxt</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 25. Hexo
   * ──────────────────────────────────────────────────────────────────────────── */
  'hexo': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add the Pulse script to your Hexo theme&apos;s layout file.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Edit your theme&apos;s layout</h3>
      <p>
        Open the layout file for your active theme and add the Pulse script
        inside the <code>&lt;head&gt;</code>.
      </p>
      <CodeBlock filename="themes/your-theme/layout/layout.ejs">{`<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">

    <script
      defer
      data-domain="your-site.com"
      src="https://pulse.ciphera.net/script.js"
    ></script>

    <title><%= config.title %></title>
    <%- css('css/style') %>
</head>
<body>
    <%- body %>
    <%- js('js/script') %>
</body>
</html>`}</CodeBlock>

      <p>
        Alternatively, you can use Hexo&apos;s <code>after_render</code> filter
        to inject the script programmatically.
      </p>

      <p>
        For more details, see the{' '}
        <a href="https://hexo.io/docs/templates" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Hexo templates docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/hugo" className="text-brand-orange hover:underline">Hugo</a>,{' '}
        <a href="/integrations/jekyll" className="text-brand-orange hover:underline">Jekyll</a>,{' '}
        <a href="/integrations/eleventy" className="text-brand-orange hover:underline">Eleventy</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 26. MkDocs
   * ──────────────────────────────────────────────────────────────────────────── */
  'mkdocs': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add the Pulse script to your MkDocs site using a custom template
        override.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Step 1: Create a custom template override</h3>
      <p>
        To include the <code>data-domain</code> attribute, create a template
        override file.
      </p>
      <CodeBlock filename="overrides/main.html">{`{% extends "base.html" %}

{% block extrahead %}
<script
  defer
  data-domain="your-site.com"
  src="https://pulse.ciphera.net/script.js"
></script>
{% endblock %}`}</CodeBlock>

      <h3>Step 2: Configure mkdocs.yml</h3>
      <p>
        Set the <code>custom_dir</code> to your overrides folder in your
        MkDocs configuration.
      </p>
      <CodeBlock filename="mkdocs.yml">{`theme:
  name: material
  custom_dir: overrides`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://www.mkdocs.org/user-guide/customizing-your-theme/" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          MkDocs customization docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/docusaurus" className="text-brand-orange hover:underline">Docusaurus</a>,{' '}
        <a href="/integrations/vitepress" className="text-brand-orange hover:underline">VitePress</a>,{' '}
        <a href="/integrations/django" className="text-brand-orange hover:underline">Django</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 27. WordPress
   * ──────────────────────────────────────────────────────────────────────────── */
  'wordpress': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add the Pulse script via a plugin or by editing your theme&apos;s header
        file directly.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Method 1: Using a plugin (Recommended)</h3>
      <p>
        The easiest way is to use the{' '}
        <a href="https://wordpress.org/plugins/insert-headers-and-footers/" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          WPCode (Insert Headers and Footers)
        </a>{' '}
        plugin. Install it, then go to <strong>Code Snippets &rarr; Header &amp; Footer</strong>{' '}
        and paste the Pulse script into the Header section.
      </p>
      <CodeBlock filename="Header Script">{`<script
  defer
  data-domain="your-site.com"
  src="https://pulse.ciphera.net/script.js"
></script>`}</CodeBlock>

      <h3>Method 2: Edit header.php directly</h3>
      <p>
        Go to <strong>Appearance &rarr; Theme File Editor</strong> and edit{' '}
        <code>header.php</code>. Add the Pulse script before the closing{' '}
        <code>&lt;/head&gt;</code> tag.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/ghost" className="text-brand-orange hover:underline">Ghost</a>,{' '}
        <a href="/integrations/drupal" className="text-brand-orange hover:underline">Drupal</a>,{' '}
        <a href="/integrations/woocommerce" className="text-brand-orange hover:underline">WooCommerce</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 28. Ghost
   * ──────────────────────────────────────────────────────────────────────────── */
  'ghost': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Use Ghost&apos;s built-in Code Injection feature to add the Pulse
        script — no theme editing required.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add via Code Injection</h3>
      <p>
        Go to <strong>Settings &rarr; Code injection &rarr; Site Header</strong>{' '}
        and paste the Pulse script.
      </p>
      <CodeBlock filename="Settings → Code injection → Site Header">{`<script
  defer
  data-domain="your-site.com"
  src="https://pulse.ciphera.net/script.js"
></script>`}</CodeBlock>

      <p>
        Alternatively, you can add the script directly to your theme&apos;s{' '}
        <code>default.hbs</code> template file.
      </p>

      <p>
        For more details, see the{' '}
        <a href="https://ghost.org/docs/themes/" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Ghost themes docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/wordpress" className="text-brand-orange hover:underline">WordPress</a>,{' '}
        <a href="/integrations/blogger" className="text-brand-orange hover:underline">Blogger</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 29. Drupal
   * ──────────────────────────────────────────────────────────────────────────── */
  'drupal': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add the Pulse script via a contributed module or by editing your
        theme&apos;s Twig template.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Method 1: Using Asset Injector module</h3>
      <p>
        Install the{' '}
        <a href="https://www.drupal.org/project/asset_injector" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Asset Injector
        </a>{' '}
        module and create a new JS injector with the Pulse script. Set it to
        load on all pages in the header region.
      </p>

      <h3>Method 2: Edit html.html.twig</h3>
      <p>
        Add the script directly to your theme&apos;s{' '}
        <code>html.html.twig</code> template in the head area.
      </p>
      <CodeBlock filename="templates/html.html.twig">{`<!DOCTYPE html>
<html{{ html_attributes }}>
<head>
    <head-placeholder token="{{ placeholder_token }}">
    <title>{{ head_title|safe_join(' | ') }}</title>
    <css-placeholder token="{{ placeholder_token }}">
    <js-placeholder token="{{ placeholder_token }}">

    <script
      defer
      data-domain="your-site.com"
      src="https://pulse.ciphera.net/script.js"
    ></script>
</head>
<body{{ attributes }}>
    {{ page_top }}
    {{ page }}
    {{ page_bottom }}
    <js-bottom-placeholder token="{{ placeholder_token }}">
</body>
</html>`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://www.drupal.org/docs/theming-drupal" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Drupal theming docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/wordpress" className="text-brand-orange hover:underline">WordPress</a>,{' '}
        <a href="/integrations/joomla" className="text-brand-orange hover:underline">Joomla</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 30. Joomla
   * ──────────────────────────────────────────────────────────────────────────── */
  'joomla': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add the Pulse script via your Joomla template or a custom HTML module.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Method 1: Edit template index.php</h3>
      <p>
        Go to <strong>Extensions &rarr; Templates &rarr; Your Template</strong>{' '}
        and edit <code>index.php</code>. Add the Pulse script before the
        closing <code>&lt;/head&gt;</code> tag.
      </p>
      <CodeBlock filename="templates/your-template/index.php">{`<?php defined('_JEXEC') or die; ?>
<!DOCTYPE html>
<html lang="<?php echo $this->language; ?>">
<head>
    <jdoc:include type="head" />

    <script
      defer
      data-domain="your-site.com"
      src="https://pulse.ciphera.net/script.js"
    ></script>
</head>
<body>
    <jdoc:include type="component" />
</body>
</html>`}</CodeBlock>

      <h3>Method 2: Custom HTML module</h3>
      <p>
        Create a &ldquo;Custom HTML&rdquo; module and assign it to the head
        position of your template. Paste the Pulse script as the content.
      </p>

      <p>
        For more details, see the{' '}
        <a href="https://docs.joomla.org/J4.x:Template_Layouts" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Joomla template docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/wordpress" className="text-brand-orange hover:underline">WordPress</a>,{' '}
        <a href="/integrations/drupal" className="text-brand-orange hover:underline">Drupal</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 31. Strapi
   * ──────────────────────────────────────────────────────────────────────────── */
  'strapi': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Strapi is a headless CMS — add Pulse to the <strong>frontend</strong>{' '}
        that consumes your Strapi API, not to Strapi itself.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Where to add the script</h3>
      <p>
        Since Strapi is an API-only backend, the analytics script belongs in
        your frontend application. Follow the guide for whichever framework
        you&apos;re using to render your Strapi content:
      </p>
      <ul>
        <li><a href="/integrations/nextjs" className="text-brand-orange hover:underline">Next.js</a></li>
        <li><a href="/integrations/gatsby" className="text-brand-orange hover:underline">Gatsby</a></li>
        <li><a href="/integrations/nuxt" className="text-brand-orange hover:underline">Nuxt</a></li>
        <li><a href="/integrations/react" className="text-brand-orange hover:underline">React</a></li>
        <li><a href="/integrations/vue" className="text-brand-orange hover:underline">Vue.js</a></li>
      </ul>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/contentful" className="text-brand-orange hover:underline">Contentful</a>,{' '}
        <a href="/integrations/sanity" className="text-brand-orange hover:underline">Sanity</a>,{' '}
        <a href="/integrations/nextjs" className="text-brand-orange hover:underline">Next.js</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 32. Sanity
   * ──────────────────────────────────────────────────────────────────────────── */
  'sanity': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Sanity is a headless CMS — add Pulse to the <strong>frontend</strong>{' '}
        that renders your Sanity content, not to Sanity Studio.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Where to add the script</h3>
      <p>
        Since Sanity is a headless content platform, the analytics script
        belongs in your frontend application. Follow the guide for whichever
        framework you&apos;re using:
      </p>
      <ul>
        <li><a href="/integrations/nextjs" className="text-brand-orange hover:underline">Next.js</a></li>
        <li><a href="/integrations/gatsby" className="text-brand-orange hover:underline">Gatsby</a></li>
        <li><a href="/integrations/nuxt" className="text-brand-orange hover:underline">Nuxt</a></li>
        <li><a href="/integrations/remix" className="text-brand-orange hover:underline">Remix</a></li>
        <li><a href="/integrations/react" className="text-brand-orange hover:underline">React</a></li>
      </ul>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/strapi" className="text-brand-orange hover:underline">Strapi</a>,{' '}
        <a href="/integrations/contentful" className="text-brand-orange hover:underline">Contentful</a>,{' '}
        <a href="/integrations/nextjs" className="text-brand-orange hover:underline">Next.js</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 33. Contentful
   * ──────────────────────────────────────────────────────────────────────────── */
  'contentful': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Contentful is a headless CMS — add Pulse to the{' '}
        <strong>frontend</strong> that displays your Contentful content.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Where to add the script</h3>
      <p>
        Since Contentful is an API-first content platform, the analytics script
        belongs in your frontend application. Follow the guide for your
        framework:
      </p>
      <ul>
        <li><a href="/integrations/nextjs" className="text-brand-orange hover:underline">Next.js</a></li>
        <li><a href="/integrations/gatsby" className="text-brand-orange hover:underline">Gatsby</a></li>
        <li><a href="/integrations/nuxt" className="text-brand-orange hover:underline">Nuxt</a></li>
        <li><a href="/integrations/react" className="text-brand-orange hover:underline">React</a></li>
        <li><a href="/integrations/astro" className="text-brand-orange hover:underline">Astro</a></li>
      </ul>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/strapi" className="text-brand-orange hover:underline">Strapi</a>,{' '}
        <a href="/integrations/sanity" className="text-brand-orange hover:underline">Sanity</a>,{' '}
        <a href="/integrations/nextjs" className="text-brand-orange hover:underline">Next.js</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 34. Payload CMS
   * ──────────────────────────────────────────────────────────────────────────── */
  'payload': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Payload CMS is a headless CMS — add Pulse to the{' '}
        <strong>frontend</strong> application that renders your content.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Where to add the script</h3>
      <p>
        Since Payload is a headless CMS, the analytics script belongs in your
        frontend. Payload is most commonly used with Next.js, so the{' '}
        <a href="/integrations/nextjs" className="text-brand-orange hover:underline">Next.js guide</a>{' '}
        is the best starting point.
      </p>
      <ul>
        <li><a href="/integrations/nextjs" className="text-brand-orange hover:underline">Next.js</a> (most common with Payload)</li>
        <li><a href="/integrations/react" className="text-brand-orange hover:underline">React</a></li>
        <li><a href="/integrations/nuxt" className="text-brand-orange hover:underline">Nuxt</a></li>
        <li><a href="/integrations/astro" className="text-brand-orange hover:underline">Astro</a></li>
      </ul>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/strapi" className="text-brand-orange hover:underline">Strapi</a>,{' '}
        <a href="/integrations/contentful" className="text-brand-orange hover:underline">Contentful</a>,{' '}
        <a href="/integrations/nextjs" className="text-brand-orange hover:underline">Next.js</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 35. Shopify
   * ──────────────────────────────────────────────────────────────────────────── */
  'shopify': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add the Pulse script via the Shopify theme editor — no app needed.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Method 1: Edit theme code</h3>
      <p>
        Go to <strong>Online Store &rarr; Themes &rarr; Edit code</strong> and
        open <code>layout/theme.liquid</code>. Add the Pulse script before the
        closing <code>&lt;/head&gt;</code> tag.
      </p>
      <CodeBlock filename="layout/theme.liquid">{`<!-- Add before </head> -->
<script
  defer
  data-domain="your-site.com"
  src="https://pulse.ciphera.net/script.js"
></script>`}</CodeBlock>

      <h3>Method 2: Shopify Plus — Customer Events</h3>
      <p>
        If you&apos;re on Shopify Plus, you can add the Pulse script via{' '}
        <strong>Settings &rarr; Customer Events &rarr; Custom Pixels</strong>.
      </p>

      <p>
        Use your custom domain or <code>.myshopify.com</code> domain as the{' '}
        <code>data-domain</code> value.
      </p>

      <p>
        For more details, see the{' '}
        <a href="https://shopify.dev/docs/storefronts/themes/architecture/layouts" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Shopify theme docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/woocommerce" className="text-brand-orange hover:underline">WooCommerce</a>,{' '}
        <a href="/integrations/bigcommerce" className="text-brand-orange hover:underline">BigCommerce</a>,{' '}
        <a href="/integrations/prestashop" className="text-brand-orange hover:underline">PrestaShop</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 36. WooCommerce
   * ──────────────────────────────────────────────────────────────────────────── */
  'woocommerce': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        WooCommerce runs on WordPress. Use WordPress methods to add the Pulse
        script.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Method 1: Using a plugin (Recommended)</h3>
      <p>
        Install the{' '}
        <a href="https://wordpress.org/plugins/insert-headers-and-footers/" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          WPCode plugin
        </a>{' '}
        and paste the Pulse script into the Header section.
      </p>
      <CodeBlock filename="Header Script">{`<script
  defer
  data-domain="your-site.com"
  src="https://pulse.ciphera.net/script.js"
></script>`}</CodeBlock>

      <h3>Method 2: Edit header.php</h3>
      <p>
        Go to <strong>Appearance &rarr; Theme File Editor</strong> and add the
        Pulse script to your theme&apos;s <code>header.php</code> before{' '}
        <code>&lt;/head&gt;</code>.
      </p>

      <p>
        Use the same domain you track your main WordPress site with.
      </p>

      <p>
        For the full WordPress setup, see the{' '}
        <a href="/integrations/wordpress" className="text-brand-orange hover:underline">WordPress guide</a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/shopify" className="text-brand-orange hover:underline">Shopify</a>,{' '}
        <a href="/integrations/wordpress" className="text-brand-orange hover:underline">WordPress</a>,{' '}
        <a href="/integrations/bigcommerce" className="text-brand-orange hover:underline">BigCommerce</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 37. BigCommerce
   * ──────────────────────────────────────────────────────────────────────────── */
  'bigcommerce': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add the Pulse script via BigCommerce&apos;s Script Manager.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add via Script Manager</h3>
      <p>
        Go to <strong>Storefront &rarr; Script Manager &rarr; Create a Script</strong>{' '}
        and configure it as follows:
      </p>
      <ul>
        <li><strong>Placement:</strong> Head</li>
        <li><strong>Location:</strong> All Pages</li>
        <li><strong>Script type:</strong> Script tag</li>
      </ul>
      <CodeBlock filename="Script Manager → Head">{`<script
  defer
  data-domain="your-site.com"
  src="https://pulse.ciphera.net/script.js"
></script>`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://developer.bigcommerce.com/docs/integrations/scripts" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          BigCommerce Script Manager docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/shopify" className="text-brand-orange hover:underline">Shopify</a>,{' '}
        <a href="/integrations/woocommerce" className="text-brand-orange hover:underline">WooCommerce</a>,{' '}
        <a href="/integrations/prestashop" className="text-brand-orange hover:underline">PrestaShop</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 38. PrestaShop
   * ──────────────────────────────────────────────────────────────────────────── */
  'prestashop': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add the Pulse script to your PrestaShop theme template.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Edit your theme&apos;s head template</h3>
      <p>
        Open the head partial for your active theme and add the Pulse script.
      </p>
      <CodeBlock filename="themes/your-theme/templates/_partials/head.tpl">{`{block name='head_seo'}
  <title>{$page.meta.title}</title>
  <meta name="description" content="{$page.meta.description}">
{/block}

<script
  defer
  data-domain="your-site.com"
  src="https://pulse.ciphera.net/script.js"
></script>

{block name='head_stylesheets'}
  {include file='_partials/stylesheets.tpl'}
{/block}`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://devdocs.prestashop-project.org/8/themes/" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          PrestaShop theme docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/shopify" className="text-brand-orange hover:underline">Shopify</a>,{' '}
        <a href="/integrations/woocommerce" className="text-brand-orange hover:underline">WooCommerce</a>,{' '}
        <a href="/integrations/bigcommerce" className="text-brand-orange hover:underline">BigCommerce</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 39. Webflow
   * ──────────────────────────────────────────────────────────────────────────── */
  'webflow': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Paste the Pulse script into your Webflow project&apos;s custom code
        settings.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add via Project Settings</h3>
      <p>
        Go to <strong>Project Settings &rarr; Custom Code &rarr; Head Code</strong>{' '}
        and paste the Pulse script.
      </p>
      <CodeBlock filename="Project Settings → Head Code">{`<script
  defer
  data-domain="your-site.com"
  src="https://pulse.ciphera.net/script.js"
></script>`}</CodeBlock>

      <p>
        <strong>Note:</strong> Custom code requires a paid Webflow site plan. The
        script won&apos;t appear in the Designer preview — publish your site to
        see it in action.
      </p>

      <p>
        For more details, see the{' '}
        <a href="https://university.webflow.com/lesson/custom-code-in-the-head-and-body-tag" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Webflow custom code docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/squarespace" className="text-brand-orange hover:underline">Squarespace</a>,{' '}
        <a href="/integrations/wix" className="text-brand-orange hover:underline">Wix</a>,{' '}
        <a href="/integrations/framer" className="text-brand-orange hover:underline">Framer</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 40. Squarespace
   * ──────────────────────────────────────────────────────────────────────────── */
  'squarespace': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Use Squarespace&apos;s Code Injection feature to add the Pulse script.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add via Code Injection</h3>
      <p>
        Go to <strong>Settings &rarr; Developer Tools &rarr; Code Injection &rarr; Header</strong>{' '}
        and paste the Pulse script.
      </p>
      <CodeBlock filename="Settings → Code Injection → Header">{`<script
  defer
  data-domain="your-site.com"
  src="https://pulse.ciphera.net/script.js"
></script>`}</CodeBlock>

      <p>
        <strong>Note:</strong> Code Injection requires a Business or Commerce
        plan.
      </p>

      <p>
        For more details, see the{' '}
        <a href="https://support.squarespace.com/hc/en-us/articles/205815928" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Squarespace code injection docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/webflow" className="text-brand-orange hover:underline">Webflow</a>,{' '}
        <a href="/integrations/wix" className="text-brand-orange hover:underline">Wix</a>,{' '}
        <a href="/integrations/carrd" className="text-brand-orange hover:underline">Carrd</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 41. Wix
   * ──────────────────────────────────────────────────────────────────────────── */
  'wix': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Use Wix&apos;s Custom Code settings to add the Pulse script.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add via Custom Code</h3>
      <p>
        Go to <strong>Settings &rarr; Custom Code &rarr; Add Custom Code</strong>.
        Set the placement to <strong>Head</strong> and apply it to{' '}
        <strong>All pages</strong>.
      </p>
      <CodeBlock filename="Custom Code Snippet">{`<script
  defer
  data-domain="your-site.com"
  src="https://pulse.ciphera.net/script.js"
></script>`}</CodeBlock>

      <p>
        <strong>Note:</strong> Custom Code requires a Wix Premium plan.
      </p>

      <p>
        For more details, see the{' '}
        <a href="https://support.wix.com/en/article/embedding-custom-code-on-your-site" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Wix custom code docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/webflow" className="text-brand-orange hover:underline">Webflow</a>,{' '}
        <a href="/integrations/squarespace" className="text-brand-orange hover:underline">Squarespace</a>,{' '}
        <a href="/integrations/framer" className="text-brand-orange hover:underline">Framer</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 42. Framer
   * ──────────────────────────────────────────────────────────────────────────── */
  'framer': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add the Pulse script to your Framer project&apos;s custom code settings.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add via Project Settings</h3>
      <p>
        Go to <strong>Project Settings &rarr; General &rarr; Custom Code &rarr; Head</strong>{' '}
        and paste the Pulse script.
      </p>
      <CodeBlock filename="Project Settings → Head">{`<script
  defer
  data-domain="your-site.com"
  src="https://pulse.ciphera.net/script.js"
></script>`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://www.framer.com/help/articles/custom-code/" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Framer custom code docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/webflow" className="text-brand-orange hover:underline">Webflow</a>,{' '}
        <a href="/integrations/squarespace" className="text-brand-orange hover:underline">Squarespace</a>,{' '}
        <a href="/integrations/wix" className="text-brand-orange hover:underline">Wix</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 43. Carrd
   * ──────────────────────────────────────────────────────────────────────────── */
  'carrd': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add the Pulse script to your Carrd site&apos;s head code section.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add via Settings</h3>
      <p>
        Open your site&apos;s <strong>Settings</strong> panel and navigate to the{' '}
        <strong>Head</strong> section. Paste the Pulse script there.
      </p>
      <CodeBlock filename="Settings → Head">{`<script
  defer
  data-domain="your-site.com"
  src="https://pulse.ciphera.net/script.js"
></script>`}</CodeBlock>

      <p>
        <strong>Note:</strong> Custom code requires a Carrd Pro plan.
      </p>

      <p>
        For more details, see the{' '}
        <a href="https://carrd.co/docs/settings/head" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Carrd head settings docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/framer" className="text-brand-orange hover:underline">Framer</a>,{' '}
        <a href="/integrations/webflow" className="text-brand-orange hover:underline">Webflow</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 44. Blogger
   * ──────────────────────────────────────────────────────────────────────────── */
  'blogger': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add the Pulse script via Blogger&apos;s Theme HTML editor.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Edit your theme HTML</h3>
      <p>
        Go to <strong>Theme &rarr; Edit HTML</strong> and paste the Pulse script
        before the closing <code>&lt;/head&gt;</code> tag.
      </p>
      <CodeBlock filename="Theme → Edit HTML">{`<!-- Add before </head> -->
<script
  defer
  data-domain="your-site.com"
  src="https://pulse.ciphera.net/script.js"
></script>`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://support.google.com/blogger/answer/46995" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Blogger HTML editing docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/wordpress" className="text-brand-orange hover:underline">WordPress</a>,{' '}
        <a href="/integrations/ghost" className="text-brand-orange hover:underline">Ghost</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 45. Google Tag Manager
   * ──────────────────────────────────────────────────────────────────────────── */
  'gtm': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add Pulse via Google Tag Manager — works with any site that already has
        GTM installed.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Create a Custom HTML tag</h3>
      <p>Follow these steps to add Pulse through GTM:</p>
      <ol>
        <li>Go to <strong>Tags &rarr; New &rarr; Custom HTML</strong></li>
        <li>Paste the Pulse script</li>
        <li>Set the trigger to <strong>All Pages</strong></li>
        <li>Publish your container</li>
      </ol>
      <CodeBlock filename="GTM → Custom HTML Tag">{`<script
  defer
  data-domain="your-site.com"
  src="https://pulse.ciphera.net/script.js"
></script>`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://support.google.com/tagmanager/answer/6103696" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          GTM Custom HTML tag docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/wordpress" className="text-brand-orange hover:underline">WordPress</a>,{' '}
        <a href="/integrations/shopify" className="text-brand-orange hover:underline">Shopify</a>,{' '}
        <a href="/integrations/webflow" className="text-brand-orange hover:underline">Webflow</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 46. Notion
   * ──────────────────────────────────────────────────────────────────────────── */
  'notion': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Notion itself doesn&apos;t support custom scripts, but tools like{' '}
        <a href="https://super.so" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">Super.so</a>,{' '}
        <a href="https://potion.so" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">Potion</a>, and{' '}
        <a href="https://feather.so" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">Feather</a>{' '}
        let you turn Notion pages into websites with custom code support.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Super.so</h3>
      <p>
        Go to <strong>Site Settings &rarr; Code &rarr; Head</strong> and paste
        the Pulse script.
      </p>
      <CodeBlock filename="Super.so → Site Settings → Head">{`<script
  defer
  data-domain="your-site.com"
  src="https://pulse.ciphera.net/script.js"
></script>`}</CodeBlock>

      <h3>Potion</h3>
      <p>
        Go to <strong>Project Settings &rarr; Custom Code &rarr; Head</strong>{' '}
        and paste the Pulse script.
      </p>

      <p>
        For more details, see the{' '}
        <a href="https://super.so/docs" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Super.so docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/webflow" className="text-brand-orange hover:underline">Webflow</a>,{' '}
        <a href="/integrations/framer" className="text-brand-orange hover:underline">Framer</a>,{' '}
        <a href="/integrations/carrd" className="text-brand-orange hover:underline">Carrd</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 47. Cloudflare Pages
   * ──────────────────────────────────────────────────────────────────────────── */
  'cloudflare-pages': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add Pulse to your project&apos;s HTML or follow your framework&apos;s
        guide.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Method 1: Framework-based setup (Recommended)</h3>
      <p>
        If you&apos;re deploying a framework (Next.js, Astro, Nuxt, etc.) to
        Cloudflare Pages, follow that framework&apos;s integration guide:
      </p>
      <ul>
        <li><a href="/integrations/nextjs" className="text-brand-orange hover:underline">Next.js</a></li>
        <li><a href="/integrations/astro" className="text-brand-orange hover:underline">Astro</a></li>
        <li><a href="/integrations/nuxt" className="text-brand-orange hover:underline">Nuxt</a></li>
        <li><a href="/integrations/remix" className="text-brand-orange hover:underline">Remix</a></li>
      </ul>

      <h3>Method 2: Static HTML</h3>
      <p>
        For static HTML sites, add the Pulse script directly to your{' '}
        <code>index.html</code>.
      </p>
      <CodeBlock filename="index.html">{`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <script
      defer
      data-domain="your-site.com"
      src="https://pulse.ciphera.net/script.js"
    ></script>

    <title>My Site</title>
</head>
<body>
    <h1>Hello World</h1>
</body>
</html>`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://developers.cloudflare.com/pages/configuration/headers/" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Cloudflare Pages docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/netlify" className="text-brand-orange hover:underline">Netlify</a>,{' '}
        <a href="/integrations/vercel" className="text-brand-orange hover:underline">Vercel</a>,{' '}
        <a href="/integrations/github-pages" className="text-brand-orange hover:underline">GitHub Pages</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 48. Netlify
   * ──────────────────────────────────────────────────────────────────────────── */
  'netlify': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add Pulse via your framework&apos;s setup or Netlify&apos;s snippet
        injection feature.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Method 1: Framework guide (Recommended)</h3>
      <p>
        The best approach is to follow your framework&apos;s integration guide.
        Netlify deploys framework projects, so the script setup happens in your
        source code:
      </p>
      <ul>
        <li><a href="/integrations/nextjs" className="text-brand-orange hover:underline">Next.js</a></li>
        <li><a href="/integrations/astro" className="text-brand-orange hover:underline">Astro</a></li>
        <li><a href="/integrations/gatsby" className="text-brand-orange hover:underline">Gatsby</a></li>
        <li><a href="/integrations/hugo" className="text-brand-orange hover:underline">Hugo</a></li>
        <li><a href="/integrations/eleventy" className="text-brand-orange hover:underline">Eleventy</a></li>
      </ul>

      <h3>Method 2: Snippet injection (via Netlify UI)</h3>
      <p>
        Go to <strong>Site settings &rarr; Build &amp; deploy &rarr; Post processing &rarr; Snippet injection</strong>{' '}
        and add the Pulse script to the <strong>&lt;head&gt;</strong> of your
        pages.
      </p>
      <CodeBlock filename="Netlify Snippet Injection → Head">{`<script
  defer
  data-domain="your-site.com"
  src="https://pulse.ciphera.net/script.js"
></script>`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://docs.netlify.com/site-deploys/post-processing/snippet-injection/" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Netlify snippet injection docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/cloudflare-pages" className="text-brand-orange hover:underline">Cloudflare Pages</a>,{' '}
        <a href="/integrations/vercel" className="text-brand-orange hover:underline">Vercel</a>,{' '}
        <a href="/integrations/github-pages" className="text-brand-orange hover:underline">GitHub Pages</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 49. Vercel
   * ──────────────────────────────────────────────────────────────────────────── */
  'vercel': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add Pulse via your framework&apos;s setup. Vercel deploys framework
        projects, so the script is added in your source code.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Follow your framework&apos;s guide</h3>
      <p>
        Vercel is a deployment platform — it doesn&apos;t have a built-in
        mechanism for injecting scripts. Add the Pulse script following
        your framework&apos;s integration guide:
      </p>
      <ul>
        <li><a href="/integrations/nextjs" className="text-brand-orange hover:underline">Next.js</a> (most common on Vercel)</li>
        <li><a href="/integrations/remix" className="text-brand-orange hover:underline">Remix</a></li>
        <li><a href="/integrations/astro" className="text-brand-orange hover:underline">Astro</a></li>
        <li><a href="/integrations/nuxt" className="text-brand-orange hover:underline">Nuxt</a></li>
        <li><a href="/integrations/svelte" className="text-brand-orange hover:underline">SvelteKit</a></li>
      </ul>

      <p>
        <strong>Note:</strong> Vercel&apos;s Edge Middleware cannot inject
        scripts by design. Use the framework-level approach instead.
      </p>

      <p>
        For more details, see the{' '}
        <a href="https://vercel.com/docs/frameworks" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Vercel frameworks docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/netlify" className="text-brand-orange hover:underline">Netlify</a>,{' '}
        <a href="/integrations/cloudflare-pages" className="text-brand-orange hover:underline">Cloudflare Pages</a>,{' '}
        <a href="/integrations/nextjs" className="text-brand-orange hover:underline">Next.js</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 50. GitHub Pages
   * ──────────────────────────────────────────────────────────────────────────── */
  'github-pages': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add the Pulse script to your static site&apos;s HTML template on GitHub
        Pages.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Method 1: Jekyll (default for GitHub Pages)</h3>
      <p>
        Create an analytics include with a production guard and reference it in
        your default layout.
      </p>
      <CodeBlock filename="_includes/analytics.html">{`{% if jekyll.environment == "production" %}
<script
  defer
  data-domain="your-site.com"
  src="https://pulse.ciphera.net/script.js"
></script>
{% endif %}`}</CodeBlock>

      <p>
        Then include it in your layout&apos;s <code>&lt;head&gt;</code>:
      </p>
      <CodeBlock filename="_layouts/default.html">{`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    {% include analytics.html %}
    <title>{{ page.title }}</title>
</head>
<body>
    {{ content }}
</body>
</html>`}</CodeBlock>

      <h3>Method 2: Plain HTML</h3>
      <p>
        For simple static sites, add the Pulse script directly to your{' '}
        <code>index.html</code>.
      </p>
      <CodeBlock filename="index.html">{`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <script
      defer
      data-domain="your-site.com"
      src="https://pulse.ciphera.net/script.js"
    ></script>

    <title>My Site</title>
</head>
<body>
    <h1>Hello World</h1>
</body>
</html>`}</CodeBlock>

      <h3>Method 3: Hugo on GitHub Pages</h3>
      <p>
        If you&apos;re using Hugo with GitHub Pages, follow the{' '}
        <a href="/integrations/hugo" className="text-brand-orange hover:underline">Hugo guide</a>.
      </p>

      <p>
        For more details, see the{' '}
        <a href="https://docs.github.com/en/pages/setting-up-a-github-pages-site-with-jekyll" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          GitHub Pages docs
        </a>.
      </p>

      <p>
        <strong>Related Integrations:</strong>{' '}
        <a href="/integrations/jekyll" className="text-brand-orange hover:underline">Jekyll</a>,{' '}
        <a href="/integrations/hugo" className="text-brand-orange hover:underline">Hugo</a>,{' '}
        <a href="/integrations/netlify" className="text-brand-orange hover:underline">Netlify</a>
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 51. Craft CMS
   * ──────────────────────────────────────────────────────────────────────────── */
  'craftcms': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add Pulse to your Craft CMS site by editing your Twig layout template.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add the Pulse Script to Your Layout</h3>
      <p>
        Edit your main Twig layout template at{' '}
        <code>templates/_layout.twig</code> and add the Pulse script inside the{' '}
        <code>&lt;head&gt;</code> section.
      </p>
      <CodeBlock filename="templates/_layout.twig">{`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <script
      defer
      data-domain="your-site.com"
      src="https://pulse.ciphera.net/script.js"
    ></script>

    <title>{{ siteName }}</title>
</head>
<body>
    {% block content %}{% endblock %}
</body>
</html>`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://craftcms.com/docs/5.x/system/elements.html" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Craft CMS docs
        </a>.
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 52. Statamic
   * ──────────────────────────────────────────────────────────────────────────── */
  'statamic': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Statamic is a Laravel-based CMS. Add Pulse to your Antlers or Blade
        layout.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add the Pulse Script to Your Layout</h3>
      <p>
        Edit your Antlers layout at{' '}
        <code>resources/views/layout.antlers.html</code> and add the Pulse
        script inside the <code>&lt;head&gt;</code> section.
      </p>
      <CodeBlock filename="resources/views/layout.antlers.html">{`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <script
      defer
      data-domain="your-site.com"
      src="https://pulse.ciphera.net/script.js"
    ></script>

    <title>{{ title }}</title>
</head>
<body>
    {{ template_content }}
</body>
</html>`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://statamic.dev/views" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Statamic views docs
        </a>.
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 53. TYPO3
   * ──────────────────────────────────────────────────────────────────────────── */
  'typo3': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add Pulse to your TYPO3 site via TypoScript setup.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add the Pulse Script via TypoScript</h3>
      <p>
        Add the following to your <code>setup.typoscript</code> file to inject
        the Pulse script into the page header.
      </p>
      <CodeBlock filename="setup.typoscript">{`page.headerData.999 = TEXT
page.headerData.999.value = <script defer data-domain="your-site.com" src="https://pulse.ciphera.net/script.js"></script>`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://docs.typo3.org/m/typo3/reference-typoscript/main/en-us/" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          TypoScript reference
        </a>.
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 54. Kirby
   * ──────────────────────────────────────────────────────────────────────────── */
  'kirby': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add Pulse to your Kirby site via a PHP snippet.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add the Pulse Script to Your Header Snippet</h3>
      <p>
        Edit <code>site/snippets/header.php</code> or{' '}
        <code>site/templates/default.php</code> and add the Pulse script before
        the closing <code>&lt;/head&gt;</code> tag.
      </p>
      <CodeBlock filename="site/snippets/header.php">{`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <script
      defer
      data-domain="your-site.com"
      src="https://pulse.ciphera.net/script.js"
    ></script>

    <title><?= $page->title() ?></title>
</head>`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://getkirby.com/docs/guide/templates/snippets" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Kirby snippets docs
        </a>.
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 55. Grav
   * ──────────────────────────────────────────────────────────────────────────── */
  'grav': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add Pulse to your Grav site via Twig templates.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add the Pulse Script to Your Base Template</h3>
      <p>
        Edit your theme&apos;s base template at{' '}
        <code>templates/partials/base.html.twig</code> and add the Pulse script
        inside the head block.
      </p>
      <CodeBlock filename="templates/partials/base.html.twig">{`<!DOCTYPE html>
<html lang="en">
<head>
    {% block head %}
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <script
      defer
      data-domain="your-site.com"
      src="https://pulse.ciphera.net/script.js"
    ></script>

    <title>{{ page.title }}</title>
    {% endblock %}
</head>
<body>
    {% block content %}{% endblock %}
</body>
</html>`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://learn.getgrav.org/17/themes/twig-primer" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Grav Twig docs
        </a>.
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 56. Umbraco
   * ──────────────────────────────────────────────────────────────────────────── */
  'umbraco': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add Pulse to your Umbraco site via a Razor layout view.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add the Pulse Script to Your Layout</h3>
      <p>
        Edit <code>Views/Shared/_Layout.cshtml</code> and add the Pulse script
        before the closing <code>&lt;/head&gt;</code> tag. Use an environment
        tag guard to only load in production.
      </p>
      <CodeBlock filename="Views/Shared/_Layout.cshtml">{`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <environment include="Production">
        <script
          defer
          data-domain="your-site.com"
          src="https://pulse.ciphera.net/script.js"
        ></script>
    </environment>

    <title>@ViewData["Title"]</title>
</head>
<body>
    @RenderBody()
</body>
</html>`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://docs.umbraco.com/umbraco-cms/fundamentals/design/templates" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Umbraco templates docs
        </a>.
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 57. Storyblok
   * ──────────────────────────────────────────────────────────────────────────── */
  'storyblok': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Storyblok is a headless CMS — add Pulse to the frontend that renders
        your Storyblok content.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add Pulse to Your Frontend</h3>
      <p>
        Since Storyblok is a headless CMS, the analytics script goes in your
        frontend framework. Follow the guide for your framework:
      </p>
      <ul>
        <li><a href="/integrations/nextjs" className="text-brand-orange hover:underline">Next.js</a></li>
        <li><a href="/integrations/nuxt" className="text-brand-orange hover:underline">Nuxt</a></li>
        <li><a href="/integrations/gatsby" className="text-brand-orange hover:underline">Gatsby</a></li>
        <li><a href="/integrations/astro" className="text-brand-orange hover:underline">Astro</a></li>
        <li><a href="/integrations/svelte" className="text-brand-orange hover:underline">SvelteKit</a></li>
      </ul>

      <p>
        For more details, see the{' '}
        <a href="https://www.storyblok.com/docs/guide/introduction" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Storyblok docs
        </a>.
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 58. Prismic
   * ──────────────────────────────────────────────────────────────────────────── */
  'prismic': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Prismic is a headless CMS — add Pulse to the frontend that displays
        your Prismic content.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add Pulse to Your Frontend</h3>
      <p>
        Since Prismic is a headless CMS, the analytics script goes in your
        frontend framework. Follow the guide for your framework:
      </p>
      <ul>
        <li><a href="/integrations/nextjs" className="text-brand-orange hover:underline">Next.js</a></li>
        <li><a href="/integrations/nuxt" className="text-brand-orange hover:underline">Nuxt</a></li>
        <li><a href="/integrations/gatsby" className="text-brand-orange hover:underline">Gatsby</a></li>
        <li><a href="/integrations/astro" className="text-brand-orange hover:underline">Astro</a></li>
        <li><a href="/integrations/svelte" className="text-brand-orange hover:underline">SvelteKit</a></li>
      </ul>

      <p>
        For more details, see the{' '}
        <a href="https://prismic.io/docs" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Prismic docs
        </a>.
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 59. Shopware
   * ──────────────────────────────────────────────────────────────────────────── */
  'shopware': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add Pulse to your Shopware 6 store via theme template.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add the Pulse Script to Your Theme</h3>
      <p>
        Edit{' '}
        <code>Resources/views/storefront/layout/meta.html.twig</code> in your
        theme and add the Pulse script in the <code>base_header</code> block.
      </p>
      <CodeBlock filename="Resources/views/storefront/layout/meta.html.twig">{`{% sw_extends '@Storefront/storefront/layout/meta.html.twig' %}

{% block base_header %}
    {{ parent() }}

    <script
      defer
      data-domain="your-site.com"
      src="https://pulse.ciphera.net/script.js"
    ></script>
{% endblock %}`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://developer.shopware.com/docs/guides/plugins/themes/" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Shopware themes docs
        </a>.
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 60. Magento / Adobe Commerce
   * ──────────────────────────────────────────────────────────────────────────── */
  'magento': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add Pulse to your Magento / Adobe Commerce store via layout XML.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Method 1: Layout XML</h3>
      <p>
        Add the Pulse script to your theme&apos;s layout XML at{' '}
        <code>app/design/frontend/YOUR_THEME/default/Magento_Theme/layout/default_head_blocks.xml</code>.
      </p>
      <CodeBlock filename="default_head_blocks.xml">{`<page xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <head>
        <script src="https://pulse.ciphera.net/script.js"
                src_type="url"
                defer="true" />
    </head>
</page>`}</CodeBlock>

      <h3>Method 2: Admin Panel</h3>
      <p>
        Go to <strong>Content &rarr; Design &rarr; Configuration &rarr; HTML
        Head &rarr; Scripts and Style Sheets</strong> and paste the Pulse
        script.
      </p>
      <CodeBlock filename="Admin → HTML Head">{`<script
  defer
  data-domain="your-site.com"
  src="https://pulse.ciphera.net/script.js"
></script>`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://developer.adobe.com/commerce/frontend-core/guide/layouts/" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Magento layout docs
        </a>.
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 61. Bubble
   * ──────────────────────────────────────────────────────────────────────────── */
  'bubble': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add Pulse to your Bubble app via the SEO / Meta tags section.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add the Pulse Script via Settings</h3>
      <p>
        Go to <strong>Settings &rarr; SEO / Metatags &rarr; Script/meta tags in
        header</strong> and paste the Pulse script.
      </p>
      <CodeBlock filename="Bubble → SEO / Metatags → Header">{`<script
  defer
  data-domain="your-site.com"
  src="https://pulse.ciphera.net/script.js"
></script>`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://manual.bubble.io/help-guides/getting-started/application-settings" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Bubble settings docs
        </a>.
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 62. Discourse
   * ──────────────────────────────────────────────────────────────────────────── */
  'discourse': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add Pulse to your Discourse forum via admin customization.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add the Pulse Script via Theme Customization</h3>
      <p>
        Go to <strong>Admin &rarr; Customize &rarr; Themes &rarr; Edit
        CSS/HTML</strong> and add the Pulse script in the{' '}
        <code>&lt;/head&gt;</code> section.
      </p>
      <CodeBlock filename="Discourse → Theme → </head>">{`<script
  defer
  data-domain="your-site.com"
  src="https://pulse.ciphera.net/script.js"
></script>`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://meta.discourse.org/t/developer-s-guide-to-discourse-themes/93648" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Discourse themes guide
        </a>.
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 63. HubSpot
   * ──────────────────────────────────────────────────────────────────────────── */
  'hubspot': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add Pulse to your HubSpot-hosted pages via site settings.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add the Pulse Script via Site Settings</h3>
      <p>
        Go to <strong>Settings &rarr; Website &rarr; Pages &rarr; Site Header
        HTML</strong> and paste the Pulse script.
      </p>
      <CodeBlock filename="HubSpot → Site Header HTML">{`<script
  defer
  data-domain="your-site.com"
  src="https://pulse.ciphera.net/script.js"
></script>`}</CodeBlock>

      <p>
        Works for HubSpot CMS Free, Starter, Pro, and Enterprise.
      </p>

      <p>
        For more details, see the{' '}
        <a href="https://knowledge.hubspot.com/website-pages/add-code-snippets-to-the-head-and-footer-html-of-your-pages" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          HubSpot header code docs
        </a>.
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 64. Substack
   * ──────────────────────────────────────────────────────────────────────────── */
  'substack': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Substack supports custom domains. Add Pulse tracking for your custom
        domain.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Track Your Substack via a Custom Domain</h3>
      <p>
        Substack doesn&apos;t allow custom scripts directly. You can track your
        Substack via your custom domain by configuring Pulse to track the custom
        domain.
      </p>
      <ol>
        <li>Set up your custom domain in Substack.</li>
        <li>Add your custom domain in the Pulse dashboard.</li>
        <li>Pulse will automatically track page views on your custom domain.</li>
      </ol>

      <p>
        For more details, see the{' '}
        <a href="https://support.substack.com/hc/en-us/articles/360037645932-How-do-I-set-up-a-custom-domain-" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Substack custom domain docs
        </a>.
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 65. Linktree
   * ──────────────────────────────────────────────────────────────────────────── */
  'linktree': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add Pulse to your Linktree page via custom code (Business plan
        required).
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add the Pulse Script via Custom Meta Tags</h3>
      <p>
        Go to <strong>Settings &rarr; SEO &rarr; Custom Meta Tags</strong> and
        add the Pulse script to the head.
      </p>
      <CodeBlock filename="Linktree → SEO → Head">{`<script
  defer
  data-domain="your-site.com"
  src="https://pulse.ciphera.net/script.js"
></script>`}</CodeBlock>

      <p>
        <strong>Note:</strong> Requires Linktree Business or Enterprise plan.
      </p>

      <p>
        For more details, see{' '}
        <a href="https://linktr.ee/s/business/" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Linktree Business
        </a>.
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 66. Weebly
   * ──────────────────────────────────────────────────────────────────────────── */
  'weebly': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add Pulse to your Weebly site via the header code settings.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add the Pulse Script via SEO Settings</h3>
      <p>
        Go to <strong>Settings &rarr; SEO &rarr; Header Code</strong> and paste
        the Pulse script.
      </p>
      <CodeBlock filename="Weebly → SEO → Header Code">{`<script
  defer
  data-domain="your-site.com"
  src="https://pulse.ciphera.net/script.js"
></script>`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://www.weebly.com/app/help/us/en/topics/descriptions-and-keywords" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Weebly SEO docs
        </a>.
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 67. GitBook
   * ──────────────────────────────────────────────────────────────────────────── */
  'gitbook': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add Pulse to your GitBook documentation site.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add the Pulse Script via Custom Scripts</h3>
      <p>
        GitBook supports custom header integrations. Go to{' '}
        <strong>Space settings &rarr; Integrations &rarr; Custom
        scripts</strong> and add the Pulse script.
      </p>
      <CodeBlock filename="GitBook → Custom Scripts">{`<script
  defer
  data-domain="your-site.com"
  src="https://pulse.ciphera.net/script.js"
></script>`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://docs.gitbook.com/published-documentation/customization/space-customization" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          GitBook customization docs
        </a>.
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 68. Gridsome
   * ──────────────────────────────────────────────────────────────────────────── */
  'gridsome': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add Pulse to your Gridsome site via the HTML template or a plugin.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Method 1: HTML Template</h3>
      <p>
        Edit <code>src/index.html</code> and add the Pulse script to the head
        section.
      </p>
      <CodeBlock filename="src/index.html">{`<!DOCTYPE html>
<html \${htmlAttrs}>
<head>
    \${head}

    <script
      defer
      data-domain="your-site.com"
      src="https://pulse.ciphera.net/script.js"
    ></script>
</head>
<body \${bodyAttrs}>
    \${app}
</body>
</html>`}</CodeBlock>

      <h3>Method 2: Server Configuration</h3>
      <p>
        Use <code>gridsome.server.js</code> to inject the script
        programmatically.
      </p>
      <CodeBlock filename="gridsome.server.js">{`module.exports = function (api) {
  api.afterBuild(({ queue }) => {
    // Script injection logic
  })
}`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://gridsome.org/docs/head/" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Gridsome head management docs
        </a>.
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 69. Read the Docs
   * ──────────────────────────────────────────────────────────────────────────── */
  'readthedocs': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add Pulse to your Read the Docs documentation.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add the Pulse Script via Sphinx Configuration</h3>
      <p>
        Create a custom template override. In your Sphinx{' '}
        <code>conf.py</code>, add the Pulse script as a JavaScript file.
      </p>
      <CodeBlock filename="conf.py">{`html_js_files = [
    ('https://pulse.ciphera.net/script.js', {'defer': 'defer', 'data-domain': 'your-site.com'}),
]`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://docs.readthedocs.io/en/stable/guides/adding-custom-css.html" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Read the Docs customization
        </a>.
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 70. Sphinx
   * ──────────────────────────────────────────────────────────────────────────── */
  'sphinx': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add Pulse to your Sphinx documentation via <code>conf.py</code>.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add the Pulse Script via Configuration</h3>
      <p>
        In your <code>conf.py</code>, add the Pulse script using{' '}
        <code>html_js_files</code>.
      </p>
      <CodeBlock filename="conf.py">{`html_js_files = [
    ('https://pulse.ciphera.net/script.js', {'defer': 'defer', 'data-domain': 'your-site.com'}),
]`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://www.sphinx-doc.org/en/master/usage/configuration.html#confval-html_js_files" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Sphinx html_js_files docs
        </a>.
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 71. ReadMe
   * ──────────────────────────────────────────────────────────────────────────── */
  'readme': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add Pulse to your ReadMe API documentation portal.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add the Pulse Script via Custom JavaScript</h3>
      <p>
        Go to <strong>Project Settings &rarr; Custom JavaScript</strong> and
        paste the Pulse script.
      </p>
      <CodeBlock filename="ReadMe → Custom JavaScript">{`<script
  defer
  data-domain="your-site.com"
  src="https://pulse.ciphera.net/script.js"
></script>`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://docs.readme.com/main/docs/custom-javascript" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          ReadMe custom JavaScript docs
        </a>.
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 72. Flutter Web
   * ──────────────────────────────────────────────────────────────────────────── */
  'flutter': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add Pulse to your Flutter web application via{' '}
        <code>web/index.html</code>.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add the Pulse Script to Your HTML Template</h3>
      <p>
        Edit <code>web/index.html</code> in your Flutter project and add the
        Pulse script to the <code>&lt;head&gt;</code> section.
      </p>
      <CodeBlock filename="web/index.html">{`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <script
      defer
      data-domain="your-site.com"
      src="https://pulse.ciphera.net/script.js"
    ></script>

    <title>My Flutter App</title>
</head>
<body>
    <script src="main.dart.js" type="application/javascript"></script>
</body>
</html>`}</CodeBlock>

      <p>
        <strong>Note:</strong> This only applies to Flutter Web. For Flutter
        mobile apps, Pulse tracks web views only.
      </p>

      <p>
        For more details, see the{' '}
        <a href="https://docs.flutter.dev/platform-integration/web/building" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Flutter Web docs
        </a>.
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 73. Render
   * ──────────────────────────────────────────────────────────────────────────── */
  'render': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add Pulse via your framework setup. Render deploys framework projects.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Follow Your Framework&apos;s Guide</h3>
      <p>
        The analytics script goes in your source code, not in Render&apos;s
        dashboard. Follow your framework&apos;s integration guide:
      </p>
      <ul>
        <li><a href="/integrations/nextjs" className="text-brand-orange hover:underline">Next.js</a></li>
        <li><a href="/integrations/astro" className="text-brand-orange hover:underline">Astro</a></li>
        <li><a href="/integrations/remix" className="text-brand-orange hover:underline">Remix</a></li>
        <li><a href="/integrations/gatsby" className="text-brand-orange hover:underline">Gatsby</a></li>
        <li><a href="/integrations/eleventy" className="text-brand-orange hover:underline">Eleventy</a></li>
      </ul>

      <p>
        For more details, see the{' '}
        <a href="https://docs.render.com/deploy-an-app" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Render deployment docs
        </a>.
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 74. Firebase Hosting
   * ──────────────────────────────────────────────────────────────────────────── */
  'firebase': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add Pulse to sites deployed on Firebase Hosting.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add the Pulse Script to Your Source Code</h3>
      <p>
        Follow your framework&apos;s integration guide. The analytics script
        goes in your source code. Firebase Hosting serves static files, so add
        the script to your <code>index.html</code> or framework layout.
      </p>
      <CodeBlock filename="public/index.html">{`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <script
      defer
      data-domain="your-site.com"
      src="https://pulse.ciphera.net/script.js"
    ></script>

    <title>My App</title>
</head>
<body>
    <div id="app"></div>
</body>
</html>`}</CodeBlock>

      <p>
        For more details, see the{' '}
        <a href="https://firebase.google.com/docs/hosting" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          Firebase Hosting docs
        </a>.
      </p>
    </>
  ),

  /* ────────────────────────────────────────────────────────────────────────────
   * 75. AMP
   * ──────────────────────────────────────────────────────────────────────────── */
  'amp': (
    <>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add Pulse to your AMP pages using the <code>amp-analytics</code>{' '}
        component.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Add Pulse via amp-analytics</h3>
      <p>
        AMP pages have restrictions on JavaScript. The{' '}
        <code>amp-analytics</code> component is the standard way to add
        analytics. Add the following to your AMP page.
      </p>
      <CodeBlock filename="amp-page.html">{`<amp-analytics>
  <script type="application/json">
  {
    "requests": {
      "pageview": "https://pulse.ciphera.net/api/event"
    },
    "triggers": {
      "trackPageview": {
        "on": "visible",
        "request": "pageview",
        "extraUrlParams": {
          "domain": "your-site.com",
          "name": "pageview",
          "url": "\${canonicalUrl}"
        }
      }
    }
  }
  </script>
</amp-analytics>`}</CodeBlock>

      <p>
        <strong>Note:</strong> AMP pages have restrictions on JavaScript. The{' '}
        <code>amp-analytics</code> component is the standard way to add
        analytics.
      </p>

      <p>
        For more details, see the{' '}
        <a href="https://amp.dev/documentation/components/amp-analytics/" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
          amp-analytics docs
        </a>.
      </p>
    </>
  ),
}

// * ─── Public API ─────────────────────────────────────────────────────────────

export function getGuideContent(slug: string): ReactNode | undefined {
  return guides[slug]
}
