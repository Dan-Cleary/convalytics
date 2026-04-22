// Rendered as static HTML at build time into dist/about/index.html and also
// mounted by React at /about. See scripts/prerender.mts and App.tsx.

export function AboutContent() {
  return (
    <main>
      <header>
        <h1>About Convalytics</h1>
        <p>
          Convalytics is analytics for Convex apps: page views, custom
          events, user identification, retention, and funnels, built by a
          solo developer who got tired of wiring up general-purpose analytics
          every time he started a new project on Convex.
        </p>
      </header>

      <section>
        <h2>Why it exists</h2>
        <p>
          The Convex ecosystem has excellent primitives for building SaaS
          apps: the database, functions, cron jobs, scheduled jobs, file
          storage, and a fully reactive client are all first-class. But
          until Convalytics there was no first-class analytics layer. Teams
          were stuck wiring up general-purpose tools that weren't Convex-aware
          and needed manual instrumentation.
        </p>
        <p>
          Convalytics is what happens when analytics is built for Convex:
          server-side events that use the exact same <code>ctx</code> pattern
          as your mutations, a backend component that installs like any
          other Convex component, and an agent-first setup flow because
          most new Convex projects are built with an AI coding assistant.
        </p>
      </section>

      <section>
        <h2>Who makes it</h2>
        <p>
          Convalytics is built by Dan Cleary, operating as Tethered Software
          Inc. Source code for both the dashboard and the Convex backend
          component is public on GitHub:
        </p>
        <ul>
          <li>
            <a href="https://github.com/Dan-Cleary/convalytics">
              Dan-Cleary/convalytics
            </a>{" "}
            — the dashboard, billing, and HTTP ingest endpoints
          </li>
          <li>
            <a href="https://github.com/Dan-Cleary/convalytics-convex-component">
              Dan-Cleary/convalytics-convex-component
            </a>{" "}
            — the Convex backend component, MIT licensed
          </li>
          <li>
            <a href="https://www.npmjs.com/package/convalytics-dev">
              convalytics-dev
            </a>{" "}
            on npm
          </li>
          <li>
            <a href="https://www.npmjs.com/package/convalytics">convalytics</a>{" "}
            on npm (the setup CLI)
          </li>
        </ul>
      </section>

      <section>
        <h2>Built on Convex</h2>
        <p>
          Convalytics itself runs on Convex. The dashboard, ingest endpoints,
          quota enforcement, billing webhooks, and scheduled jobs are all
          Convex functions. The Convex backend component that Convalytics
          publishes to npm is the same component used internally to track
          events on this product.
        </p>
      </section>

      <section>
        <h2>Licensing</h2>
        <p>
          The Convex backend component and the setup CLI are MIT licensed
          and open source. You can read, fork, or self-host them. The hosted
          dashboard at convalytics.dev runs on Convex Cloud and takes care
          of ingestion, retention, and billing in exchange for the pricing
          shown on the <a href="/">pricing section</a>.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <ul>
          <li>
            General: <a href="mailto:hello@convalytics.dev">hello@convalytics.dev</a>
          </li>
          <li>
            Security disclosure: see{" "}
            <a href="/.well-known/security.txt">/.well-known/security.txt</a>
          </li>
          <li>
            Bugs and feature requests:{" "}
            <a href="https://github.com/Dan-Cleary/convalytics/issues">
              GitHub issues
            </a>
          </li>
          <li>
            Founder on X: <a href="https://x.com/DanJCleary">@DanJCleary</a>
          </li>
        </ul>
      </section>

      <nav aria-label="Site navigation">
        <p>
          <a href="/">Home</a> · <a href="/about">About</a> ·{" "}
          <a href="/privacy">Privacy</a> · <a href="/contact">Contact</a>
        </p>
      </nav>
    </main>
  );
}
