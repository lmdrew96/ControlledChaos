import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Link,
  Hr,
  Heading,
} from "@react-email/components";

interface EveningDigestProps {
  userName: string;
  aiNote: string;
  completedTasks: Array<{ title: string }>;
  tomorrowPriority: { title: string; deadline?: string } | null;
  settingsUrl: string;
}

export function EveningDigestEmail({
  userName,
  aiNote,
  completedTasks,
  tomorrowPriority,
  settingsUrl,
}: EveningDigestProps) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>
            Evening wrap-up, {userName || "friend"}
          </Heading>

          <Section style={aiSection}>
            <Text style={aiText}>{aiNote}</Text>
          </Section>

          {completedTasks.length > 0 && (
            <Section>
              <Text style={sectionTitle}>What You Got Done Today</Text>
              {completedTasks.map((task, i) => (
                <Text key={i} style={listItem}>
                  ✓ {task.title}
                </Text>
              ))}
            </Section>
          )}

          {completedTasks.length === 0 && (
            <Section>
              <Text style={gentleNote}>
                No tasks checked off today — and that&apos;s completely fine. Tomorrow&apos;s a fresh start.
              </Text>
            </Section>
          )}

          {tomorrowPriority && (
            <Section>
              <Text style={sectionTitle}>Tomorrow&apos;s Top Priority</Text>
              <Text style={listItem}>
                {tomorrowPriority.title}
                {tomorrowPriority.deadline && (
                  <span style={deadlineStyle}>
                    {" "}
                    (due {tomorrowPriority.deadline})
                  </span>
                )}
              </Text>
            </Section>
          )}

          <Hr style={hr} />

          <Text style={footer}>
            <Link href={settingsUrl} style={footerLink}>
              Manage email preferences
            </Link>
            {" · "}ControlledChaos
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#f6f6f6",
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
};

const container = {
  backgroundColor: "#ffffff",
  margin: "40px auto" as const,
  padding: "32px",
  borderRadius: "8px",
  maxWidth: "560px",
};

const heading = {
  fontSize: "22px",
  fontWeight: "600" as const,
  color: "#1a1a1a",
  margin: "0 0 16px",
};

const aiSection = {
  backgroundColor: "#f0f0ff",
  borderRadius: "6px",
  padding: "16px",
  marginBottom: "24px",
};

const aiText = {
  fontSize: "14px",
  lineHeight: "1.6",
  color: "#333",
  margin: "0",
};

const sectionTitle = {
  fontSize: "13px",
  fontWeight: "600" as const,
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  color: "#666",
  margin: "16px 0 8px",
};

const listItem = {
  fontSize: "14px",
  lineHeight: "1.5",
  color: "#1a1a1a",
  margin: "4px 0",
};

const gentleNote = {
  fontSize: "14px",
  lineHeight: "1.5",
  color: "#666",
  fontStyle: "italic" as const,
  margin: "8px 0",
};

const deadlineStyle = {
  color: "#888",
  fontSize: "13px",
};

const hr = {
  borderColor: "#eee",
  margin: "24px 0 16px",
};

const footer = {
  fontSize: "12px",
  color: "#999",
  textAlign: "center" as const,
};

const footerLink = {
  color: "#666",
};
