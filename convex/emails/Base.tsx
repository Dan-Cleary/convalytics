import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Text,
  Link,
} from "@react-email/components";

const colors = {
  bg: "#e9e6db",
  white: "#ffffff",
  black: "#1a1814",
  orange: "#e8651c",
  muted: "#9b9488",
  border: "#1a1814",
  subtle: "#6b6456",
};

const styles = {
  body: {
    backgroundColor: colors.bg,
    fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
    margin: 0,
    padding: 0,
  },
  container: {
    maxWidth: "520px",
    margin: "40px auto",
    padding: "0 16px 40px",
  },
  logoBar: {
    marginBottom: "24px",
    display: "flex" as const,
    alignItems: "center" as const,
  },
  logoBox: {
    display: "inline-block",
    backgroundColor: colors.orange,
    padding: "6px 10px",
    marginRight: "10px",
  },
  logoText: {
    color: colors.white,
    fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
    fontWeight: 700,
    fontSize: "13px",
    letterSpacing: "2px",
    margin: 0,
  },
  card: {
    backgroundColor: colors.white,
    border: `2px solid ${colors.black}`,
    padding: "32px",
  },
  heading: {
    color: colors.black,
    fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
    fontSize: "15px",
    fontWeight: 700,
    letterSpacing: "0.5px",
    margin: "0 0 12px",
    textTransform: "uppercase" as const,
  },
  body_text: {
    color: colors.subtle,
    fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
    fontSize: "13px",
    lineHeight: "1.7",
    margin: "0 0 20px",
  },
  button: {
    backgroundColor: colors.black,
    color: colors.white,
    fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "1.5px",
    textTransform: "uppercase" as const,
    textDecoration: "none",
    padding: "12px 24px",
    display: "inline-block",
    border: `2px solid ${colors.black}`,
  },
  buttonOrange: {
    backgroundColor: colors.orange,
    color: colors.white,
    fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "1.5px",
    textTransform: "uppercase" as const,
    textDecoration: "none",
    padding: "12px 24px",
    display: "inline-block",
    border: `2px solid ${colors.orange}`,
  },
  hr: {
    borderColor: "#e0ddd6",
    margin: "24px 0",
  },
  footer: {
    color: colors.muted,
    fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
    fontSize: "10px",
    lineHeight: "1.6",
    marginTop: "24px",
    textAlign: "center" as const,
  },
  footerLink: {
    color: colors.muted,
    textDecoration: "underline",
  },
};

interface BaseEmailProps {
  preview: string;
  children: React.ReactNode;
  footerText?: string;
}

export function BaseEmail({ preview, children, footerText }: BaseEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          {/* Logo */}
          <Section style={{ marginBottom: "20px" }}>
            <table>
              <tbody>
                <tr>
                  <td>
                    <div style={styles.logoBox}>
                      <Text style={styles.logoText}>C</Text>
                    </div>
                  </td>
                  <td style={{ paddingLeft: "10px" }}>
                    <Text
                      style={{
                        ...styles.logoText,
                        color: colors.black,
                        letterSpacing: "3px",
                        fontSize: "12px",
                      }}
                    >
                      CONVALYTICS
                    </Text>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* Card */}
          <div style={styles.card}>{children}</div>

          {/* Footer */}
          <Text style={styles.footer}>
            {footerText ?? "You're receiving this email from Convalytics."}{" "}
            <Link href="https://convalytics.dev" style={styles.footerLink}>
              convalytics.dev
            </Link>
            <br />
            © 2026 Tethered Software Inc.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export { styles, colors };
