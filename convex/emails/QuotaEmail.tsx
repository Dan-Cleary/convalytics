import { Section, Text, Link, Hr } from "@react-email/components";
import { BaseEmail, styles, colors } from "./Base";

interface QuotaEmailProps {
  pct: 80 | 100;
  usage: number;
  limit: number;
  plan: string;
}

export function QuotaEmail({ pct, usage, limit, plan }: QuotaEmailProps) {
  const isOver = pct >= 100;
  const usageFmt = usage.toLocaleString();
  const limitFmt = limit.toLocaleString();

  return (
    <BaseEmail
      preview={
        isOver
          ? `Event quota reached — new events are being dropped`
          : `You've used 80% of your monthly event quota`
      }
      footerText="You received this because you're the owner of a Convalytics team."
    >
      <Text style={styles.heading}>{isOver ? "Quota reached" : "80% of quota used"}</Text>

      {/* Usage bar */}
      <div
        style={{
          backgroundColor: "#f5f4f1",
          height: "6px",
          marginBottom: "20px",
          position: "relative" as const,
        }}
      >
        <div
          style={{
            backgroundColor: isOver ? "#b94040" : colors.orange,
            height: "6px",
            width: `${Math.min(pct, 100)}%`,
          }}
        />
      </div>

      <Text style={styles.body_text}>
        {isOver ? (
          <>
            Your team has reached its monthly limit of{" "}
            <strong style={{ color: colors.black }}>{limitFmt} events</strong>. New events are
            being dropped until you upgrade or your quota resets next month.
          </>
        ) : (
          <>
            Your team has used{" "}
            <strong style={{ color: colors.black }}>
              {usageFmt} of {limitFmt} events
            </strong>{" "}
            this month on the <strong style={{ color: colors.black }}>{plan}</strong> plan.
          </>
        )}
      </Text>

      <Hr style={styles.hr} />

      <table style={{ width: "100%", marginBottom: "24px" }}>
        <tbody>
          <tr>
            <td>
              <Text style={{ ...styles.body_text, margin: 0, fontSize: "11px" }}>Used</Text>
              <Text
                style={{
                  ...styles.body_text,
                  margin: 0,
                  fontSize: "18px",
                  fontWeight: 700,
                  color: colors.black,
                }}
              >
                {usageFmt}
              </Text>
            </td>
            <td style={{ textAlign: "center" as const }}>
              <Text style={{ ...styles.body_text, margin: 0, fontSize: "11px" }}>Limit</Text>
              <Text
                style={{
                  ...styles.body_text,
                  margin: 0,
                  fontSize: "18px",
                  fontWeight: 700,
                  color: colors.black,
                }}
              >
                {limitFmt}
              </Text>
            </td>
            <td style={{ textAlign: "right" as const }}>
              <Text style={{ ...styles.body_text, margin: 0, fontSize: "11px" }}>Plan</Text>
              <Text
                style={{
                  ...styles.body_text,
                  margin: 0,
                  fontSize: "18px",
                  fontWeight: 700,
                  color: colors.black,
                  textTransform: "capitalize" as const,
                }}
              >
                {plan}
              </Text>
            </td>
          </tr>
        </tbody>
      </table>

      <Section style={{ margin: "0 0 4px" }}>
        <Link href="https://convalytics.dev/billing" style={styles.button}>
          {isOver ? "Upgrade plan →" : "View billing →"}
        </Link>
      </Section>
    </BaseEmail>
  );
}
