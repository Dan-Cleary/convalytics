import { Section, Text, Link } from "@react-email/components";
import { BaseEmail, styles, colors } from "./Base";

interface InviteEmailProps {
  teamName: string;
  inviteUrl: string;
  role: "admin" | "member";
}

export function InviteEmail({ teamName, inviteUrl, role }: InviteEmailProps) {
  return (
    <BaseEmail
      preview={`You've been invited to join ${teamName} on Convalytics`}
      footerText="You received this because someone invited you to a Convalytics team."
    >
      <Text style={styles.heading}>You're invited</Text>
      <Text style={styles.body_text}>
        You've been invited to join <strong style={{ color: colors.black }}>{teamName}</strong> on
        Convalytics as a <strong style={{ color: colors.black }}>{role}</strong>.
      </Text>
      <Text style={styles.body_text}>
        Convalytics provides web analytics and product event tracking for Convex apps. Click below
        to accept your invite and set a password.
      </Text>

      <Section style={{ margin: "28px 0" }}>
        <Link href={inviteUrl} style={styles.buttonOrange}>
          Accept invite →
        </Link>
      </Section>

      <Text
        style={{
          ...styles.body_text,
          fontSize: "11px",
          color: colors.muted,
          margin: 0,
        }}
      >
        This invite expires in 7 days. If you weren't expecting this, you can safely ignore it.
      </Text>
    </BaseEmail>
  );
}
