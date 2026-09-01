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
import { EmailFonts, EmailHeader, emailStyles, priorityDot } from "./brand";

interface MorningDigestProps {
  userName: string;
  aiNote: string;
  todayEvents: Array<{ title: string; time: string }>;
  topTasks: Array<{
    title: string;
    priority: string;
    /** HARD deadline — an outside-world due date. */
    deadline?: string;
    /** SOFT self-imposed target. Never rendered as "due". */
    target?: string;
    /** Time they planned to START today. Not a due date. */
    plannedAt?: string;
  }>;
  deadlinesThisWeek: Array<{ title: string; deadline: string }>;
  targetsThisWeek: Array<{ title: string; target: string }>;
  settingsUrl: string;
}

export function MorningDigestEmail({
  userName,
  aiNote,
  todayEvents,
  topTasks,
  deadlinesThisWeek,
  targetsThisWeek,
  settingsUrl,
}: MorningDigestProps) {
  return (
    <Html>
      <Head>
        <EmailFonts />
      </Head>
      <Body style={emailStyles.main}>
        <Container style={emailStyles.container}>
          <EmailHeader />
          <Section style={emailStyles.body}>
            <Heading style={emailStyles.heading}>
              Good morning, {userName || "friend"}!
            </Heading>

            <Section style={emailStyles.aiSection}>
              <Text style={emailStyles.aiText}>{aiNote}</Text>
            </Section>

            {todayEvents.length > 0 && (
              <Section>
                <Text style={emailStyles.sectionTitle}>Today&apos;s Calendar</Text>
                {todayEvents.map((event, i) => (
                  <Text key={i} style={emailStyles.listItem}>
                    {event.time} — {event.title}
                  </Text>
                ))}
              </Section>
            )}

            {topTasks.length > 0 && (
              <Section>
                <Text style={emailStyles.sectionTitle}>Your Priorities</Text>
                {topTasks.map((task, i) => (
                  <Text key={i} style={emailStyles.listItem}>
                    {priorityDot(task.priority)} {task.title}
                    {task.deadline && (
                      <span style={emailStyles.deadlineStyle}> (due {task.deadline})</span>
                    )}
                    {task.target && (
                      <span style={emailStyles.targetStyle}>
                        {" "}
                        (your target: {task.target})
                      </span>
                    )}
                    {task.plannedAt && (
                      <span style={emailStyles.targetStyle}>
                        {" "}
                        (planned {task.plannedAt})
                      </span>
                    )}
                  </Text>
                ))}
              </Section>
            )}

            {deadlinesThisWeek.length > 0 && (
              <Section>
                <Text style={emailStyles.sectionTitle}>Deadlines This Week</Text>
                {deadlinesThisWeek.map((task, i) => (
                  <Text key={i} style={emailStyles.listItem}>
                    {task.deadline} — {task.title}
                  </Text>
                ))}
              </Section>
            )}

            {targetsThisWeek.length > 0 && (
              <Section>
                <Text style={emailStyles.sectionTitle}>Your Own Targets This Week</Text>
                {targetsThisWeek.map((task, i) => (
                  <Text key={i} style={emailStyles.listItem}>
                    {task.target} — {task.title}
                  </Text>
                ))}
              </Section>
            )}

            <Hr style={emailStyles.hr} />

            <Text style={emailStyles.footer}>
              <Link href={settingsUrl} style={emailStyles.footerLink}>
                Manage email preferences
              </Link>
              {" · "}ControlledChaos
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
