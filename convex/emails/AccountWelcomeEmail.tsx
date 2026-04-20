import { Section, Text, Link, Hr, Img } from "@react-email/components";
import { BaseEmail, styles, colors } from "./Base";

const GITHUB_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16"><path fill="#1a1814" d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>`;

const X_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16"><path fill="#1a1814" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.259 5.631L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/></svg>`;

const githubIconSrc = `data:image/svg+xml,${encodeURIComponent(GITHUB_SVG)}`;
const xIconSrc = `data:image/svg+xml,${encodeURIComponent(X_SVG)}`;

const iconLinkCell = {
  display: "inline-block" as const,
  verticalAlign: "middle" as const,
};

export function AccountWelcomeEmail({ dashboardUrl }: { dashboardUrl: string }) {
  return (
    <BaseEmail
      preview="Welcome to Convalytics. Your analytics are ready."
      footerText="You received this because you created a Convalytics account."
    >
      <Text style={styles.heading}>Welcome to Convalytics</Text>
      <Text style={styles.body_text}>
        Hey, I'm Dan. I built Convalytics because I wanted real analytics for my
        Convex apps without duct-taping together five different tools. Glad you're
        trying it out.
      </Text>
      <Text style={styles.body_text}>
        It's open source, so you can see exactly how it works. Install the CLI in
        your Convex project and you'll have page views flowing in a few minutes,
        no code beyond the init.
      </Text>

      <Hr style={styles.hr} />

      <Text
        style={{
          ...styles.body_text,
          fontSize: "12px",
          fontWeight: 700,
          color: colors.black,
          margin: "0 0 8px",
          textTransform: "uppercase" as const,
          letterSpacing: "1px",
        }}
      >
        Get started
      </Text>

      {[
        ["Install the CLI", "npx convalytics init in your Convex project"],
        ["Page views", "Automatic — no code required after install"],
        ["Custom events", "Track signups, payments, anything you care about"],
      ].map(([step, desc]) => (
        <table key={step} style={{ marginBottom: "10px", width: "100%" }}>
          <tbody>
            <tr>
              <td style={{ width: "16px", verticalAlign: "top", paddingTop: "1px" }}>
                <Text
                  style={{ ...styles.body_text, margin: 0, color: colors.orange, fontSize: "12px" }}
                >
                  ›
                </Text>
              </td>
              <td style={{ paddingLeft: "8px" }}>
                <Text style={{ ...styles.body_text, margin: 0, fontSize: "12px" }}>
                  <strong style={{ color: colors.black }}>{step}</strong> — {desc}
                </Text>
              </td>
            </tr>
          </tbody>
        </table>
      ))}

      <Section style={{ margin: "28px 0 4px" }}>
        <Link href={dashboardUrl} style={styles.button}>
          Open dashboard →
        </Link>
      </Section>

      <Hr style={styles.hr} />

      <table style={{ width: "100%" }}>
        <tbody>
          <tr>
            <td>
              <Text style={{ ...styles.body_text, fontSize: "11px", margin: 0, color: colors.muted }}>
                Dan, building in public
              </Text>
            </td>
            <td style={{ textAlign: "right" as const }}>
              <Link
                href="https://github.com/Dan-Cleary/convalytics"
                style={{ ...iconLinkCell, marginRight: "12px", textDecoration: "none" }}
              >
                <Img
                  src={githubIconSrc}
                  width="16"
                  height="16"
                  alt="GitHub"
                  style={{ display: "inline-block", verticalAlign: "middle", opacity: 0.6 }}
                />
              </Link>
              <Link
                href="https://x.com/DanJCleary"
                style={{ ...iconLinkCell, textDecoration: "none" }}
              >
                <Img
                  src={xIconSrc}
                  width="16"
                  height="16"
                  alt="X"
                  style={{ display: "inline-block", verticalAlign: "middle", opacity: 0.6 }}
                />
              </Link>
            </td>
          </tr>
        </tbody>
      </table>
    </BaseEmail>
  );
}
