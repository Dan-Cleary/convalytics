// Rendered as static HTML at build time into dist/contact/index.html and also
// mounted by React at /contact. See scripts/prerender.mts and App.tsx.

export function ContactContent() {
  return (
    <main>
      <header>
        <h1>Contact</h1>
        <p>
          Convalytics is a small operation. Reach out via whichever channel
          fits best.
        </p>
      </header>

      <section>
        <h2>General questions and support</h2>
        <p>
          <a href="mailto:hello@convalytics.dev">hello@convalytics.dev</a>
        </p>
      </section>

      <section>
        <h2>Bug reports and feature requests</h2>
        <p>
          File an issue at{" "}
          <a href="https://github.com/Dan-Cleary/convalytics/issues">
            github.com/Dan-Cleary/convalytics/issues
          </a>
          .
        </p>
      </section>

      <section>
        <h2>Security disclosure</h2>
        <p>
          See{" "}
          <a href="/.well-known/security.txt">/.well-known/security.txt</a>{" "}
          for the canonical disclosure contact. Two routes:
        </p>
        <ul>
          <li>
            <a href="mailto:hello@convalytics.dev">hello@convalytics.dev</a>{" "}
            (email, PGP on request)
          </li>
          <li>
            <a href="https://github.com/Dan-Cleary/convalytics/security/advisories/new">
              Private GitHub security advisory
            </a>
          </li>
        </ul>
      </section>

      <section>
        <h2>Open-source component</h2>
        <p>
          The Convex backend component source and issue tracker live at{" "}
          <a href="https://github.com/Dan-Cleary/convalytics-convex-component">
            Dan-Cleary/convalytics-convex-component
          </a>
          . Pull requests welcome.
        </p>
      </section>

      <section>
        <h2>Who we are</h2>
        <p>
          Convalytics is operated by Tethered Software Inc. Dan Cleary is
          the sole founder and maintainer.
        </p>
        <ul>
          <li>
            Founder on X: <a href="https://x.com/DanJCleary">@DanJCleary</a>
          </li>
          <li>
            GitHub:{" "}
            <a href="https://github.com/Dan-Cleary">Dan-Cleary</a>
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
