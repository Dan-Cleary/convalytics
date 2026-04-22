// Rendered as static HTML at build time into dist/privacy/index.html and also
// mounted by React at /privacy. See scripts/prerender.mts and App.tsx.
//
// This is a reasonable starting template based on what the system actually
// does. It should be reviewed by the operator before it stands in as the
// legal privacy policy. Dates and specific third-party claims should be
// checked against current reality.

export function PrivacyContent() {
  return (
    <main>
      <header>
        <h1>Privacy policy</h1>
        <p>Last updated: April 22, 2026.</p>
        <p>
          Convalytics is operated by Tethered Software Inc. This policy
          describes what data we collect, how we use it, and the rights you
          have over your data.
        </p>
      </header>

      <section>
        <h2>The two data flows</h2>
        <p>
          Convalytics has two distinct data flows. Understanding both helps
          clarify what each section below covers.
        </p>
        <ol>
          <li>
            <strong>Analytics data your application sends us.</strong> When
            you install Convalytics in your app, your app emits events about
            your end users. We store and display these events in your
            dashboard.
          </li>
          <li>
            <strong>Dashboard account data.</strong> When you sign in to
            convalytics.dev to view your analytics, we store the minimum
            data needed to identify you and manage your team and billing.
          </li>
        </ol>
      </section>

      <section>
        <h2>Analytics data your application sends us</h2>

        <h3>Page view events (browser script tag)</h3>
        <ul>
          <li>The URL and referrer of each page load on your site</li>
          <li>
            An anonymous visitor ID stored in <code>localStorage</code> of
            the visitor's browser
          </li>
          <li>Viewport dimensions and user agent string</li>
          <li>UTM parameters if present in the URL</li>
        </ul>

        <h3>Custom events (server-side and browser-side track calls)</h3>
        <ul>
          <li>
            The event name, <code>userId</code>, <code>sessionId</code>,
            timestamp, and any <code>props</code> you pass. You control the
            data.
          </li>
        </ul>

        <h3>User identifiers</h3>
        <ul>
          <li>
            Whatever you pass to <code>convalytics.identify()</code> or the{" "}
            <code>userEmail</code> / <code>userName</code> fields on{" "}
            <code>analytics.track()</code>. These are the identifiers of
            your end users, supplied by you.
          </li>
        </ul>

        <h3>Retention</h3>
        <p>
          Event data is retained for the duration specified by your plan: 90
          days on Free, 1 year on Solo, 5 years on Pro. After retention
          expires, records are deleted automatically.
        </p>
      </section>

      <section>
        <h2>Dashboard account data</h2>
        <p>When you sign in to convalytics.dev, we store:</p>
        <ul>
          <li>Your Google account email and display name (via Google OAuth)</li>
          <li>Team membership and role</li>
          <li>Billing information (handled by Stripe; we never receive card numbers)</li>
          <li>Session cookies for your Convalytics login</li>
        </ul>
      </section>

      <section>
        <h2>What we don't do</h2>
        <ul>
          <li>
            We do not fingerprint visitors (no canvas, WebGL, audio, or font
            enumeration)
          </li>
          <li>
            We do not cross-site track visitors between different Convalytics
            projects (each <code>writeKey</code> is scoped to exactly one
            project)
          </li>
          <li>We do not store analytics visitor IP addresses beyond request processing</li>
          <li>We do not sell or rent any of the data described above</li>
        </ul>
      </section>

      <section>
        <h2>Third parties</h2>
        <ul>
          <li>
            <strong>Convex.</strong> Backend hosting for both the dashboard
            and the ingest endpoints. Governed by{" "}
            <a href="https://www.convex.dev/legal/privacy">
              Convex's privacy policy
            </a>
            .
          </li>
          <li>
            <strong>Stripe.</strong> Payment processing for paid plans.
            Governed by{" "}
            <a href="https://stripe.com/privacy">Stripe's privacy policy</a>.
          </li>
          <li>
            <strong>Resend.</strong> Transactional email (usage alerts, billing
            notifications).
          </li>
          <li>
            <strong>Google.</strong> OAuth sign-in only. We only receive the
            account information you authorize during sign-in.
          </li>
        </ul>
      </section>

      <section>
        <h2>Your rights</h2>
        <ul>
          <li>
            <strong>Access and export.</strong> Export your project's
            analytics data as CSV from the dashboard.
          </li>
          <li>
            <strong>Delete.</strong> Delete your entire project at any time,
            which removes all associated analytics data.
          </li>
          <li>
            <strong>Account deletion.</strong> Request deletion of your
            account and all associated data by emailing{" "}
            <a href="mailto:hello@convalytics.dev">hello@convalytics.dev</a>.
          </li>
        </ul>
        <p>
          For GDPR, CCPA, or other statutory data rights, email us and we
          will honor requests within the statutory window.
        </p>
      </section>

      <section>
        <h2>Cookies on convalytics.dev</h2>
        <p>
          The marketing pages and dashboard set only the cookies required
          for authentication session management. We do not run Convalytics
          analytics (or any other third-party analytics) on the public pages
          of this site.
        </p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>
          If we update this policy, we will update the "Last updated" date
          at the top. For material changes, we will notify active account
          holders by email.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Privacy questions:{" "}
          <a href="mailto:hello@convalytics.dev">hello@convalytics.dev</a>.
        </p>
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
