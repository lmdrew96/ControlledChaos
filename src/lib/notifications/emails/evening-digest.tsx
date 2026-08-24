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
import { EmailFonts, EmailHeader, emailStyles } from "./brand";

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
      <Head>
        <EmailFonts />
      </Head>
      <Body style={emailStyles.main}>
        <Container style={emailStyles.container}>
          <EmailHeader />
          <Section style={emailStyles.body}>
            <Heading style={emailStyles.heading}>
              Evening wrap-up, {userName || "friend"}
            </Heading>

            <Section style={emailStyles.aiSection}>
              <Text style={emailStyles.aiText}>{aiNote}</Text>
            </Section>

            {completedTasks.length > 0 && (
              <Section>
                <Text style={emailStyles.sectionTitle}>What You Got Done Today</Text>
                {completedTasks.map((task, i) => (
                  <Text key={i} style={emailStyles.listItem}>
                    ✓ {task.title}
                  </Text>
                ))}
              </Section>
            )}

            {completedTasks.length === 0 && (
              <Section>
                <Text style={emailStyles.gentleNote}>
                  No tasks checked off today — and that&apos;s completely fine. Tomorrow&apos;s a fresh start.
                </Text>
              </Section>
            )}

            {tomorrowPriority && (
              <Section>
                <Text style={emailStyles.sectionTitle}>Tomorrow&apos;s Top Priority</Text>
                <Text style={emailStyles.listItem}>
                  {tomorrowPriority.title}
                  {tomorrowPriority.deadline && (
                    <span style={emailStyles.deadlineStyle}>
                      {" "}
                      (due {tomorrowPriority.deadline})
                    </span>
                  )}
                </Text>
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
