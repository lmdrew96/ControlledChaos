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

interface MorningDigestProps {
  userName: string;
  aiNote: string;
  todayEvents: Array<{ title: string; time: string }>;
  topTasks: Array<{ title: string; priority: string; deadline?: string }>;
  deadlinesThisWeek: Array<{ title: string; deadline: string }>;
  settingsUrl: string;
}

export function MorningDigestEmail({
  userName,
  aiNote,
  todayEvents,
  topTasks,
  deadlinesThisWeek,
  settingsUrl,
}: MorningDigestProps) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Good morning, {userName || "friend"}!</Heading>

          <Section style={aiSection}>
            <Text style={aiText}>{aiNote}</Text>
          </Section>

          {todayEvents.length > 0 && (
            <Section>
              <Text style={sectionTitle}>Today&apos;s Calendar</Text>
              {todayEvents.map((event, i) => (
                <Text key={i} style={listItem}>
                  {event.time} — {event.title}
                </Text>
              ))}
            </Section>
          )}

          {topTasks.length > 0 && (
            <Section>
              <Text style={sectionTitle}>Your Priorities</Text>
              {topTasks.map((task, i) => (
                <Text key={i} style={listItem}>
                  {priorityDot(task.priority)} {task.title}
                  {task.deadline && (
                    <span style={deadlineStyle}> (due {task.deadline})</span>
                  )}
                </Text>
              ))}
            </Section>
          )}

          {deadlinesThisWeek.length > 0 && (
            <Section>
              <Text style={sectionTitle}>Deadlines This Week</Text>
              {deadlinesThisWeek.map((task, i) => (
                <Text key={i} style={listItem}>
                  {task.deadline} — {task.title}
                </Text>
              ))}
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

function priorityDot(priority: string): string {
  switch (priority) {
    case "urgent":
      return "🔴";
    case "important":
      return "🟡";
    case "normal":
      return "🔵";
    default:
      return "⚪";
  }
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
