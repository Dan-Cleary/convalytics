import { Section, Text, Link, Hr } from "@react-email/components";
import { BaseEmail, styles, colors } from "./Base";

interface WelcomeEmailProps {
  projectName: string;
  dashboardUrl: string;
}

export function WelcomeEmail({ projectName, dashboardUrl }: WelcomeEmailProps) {
  return (
    <BaseEmail
      preview={`${projectName} is now tracking with Convalytics`}
      footerText="You received this because you claimed a Convalytics project."
    >
      <Text style={styles.heading}>You're all set</Text>
      <Text style={styles.body_text}>
        <strong style={{ color: colors.black }}>{projectName}</strong> is now connected to
        Convalytics. Page views are already being collected — no further setup needed.
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
        What's included
      </Text>

      {[
        ["Page views", "Automatic — no code required"],
        ["Sessions & bounce rate", "Calculated from page view sequences"],
        ["Referrers & UTMs", "Where your traffic comes from"],
        ["Country, device & browser", "Enriched server-side, no cookies"],
        ["Custom events", "Track signups, payments, anything"],
      ].map(([feature, desc]) => (
        <table key={feature} style={{ marginBottom: "10px", width: "100%" }}>
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
                  <strong style={{ color: colors.black }}>{feature}</strong> — {desc}
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
    </BaseEmail>
  );
}
