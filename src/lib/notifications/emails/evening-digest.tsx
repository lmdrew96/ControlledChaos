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
  /** Null when generation failed — the static copy below carries the email. */
  aiNote: string | null;
  completedTasks: Array<{ title: string }>;
  /** Planned sittings worked today; detail is "Done · 45 min" / "Partly". */
  sittingsWorked: Array<{ title: string; detail: string }>;
  /** Shown when nothing was checked off or worked: what the day held instead (see dayLoadSubtitle). */
  daySubtitle: string;
  /** Heading for the priority: it can be due tonight or already past due. */
  priorityLabel?: string;
  tomorrowPriority: {
    title: string;
    /** HARD deadline. */
    deadline?: string;
    /** SOFT self-imposed target — never rendered as "due". */
    target?: string;
  } | null;
  settingsUrl: string;
}

export function EveningDigestEmail({
  userName,
  aiNote,
  completedTasks,
  sittingsWorked,
  daySubtitle,
  priorityLabel = "Tomorrow's Top Priority",
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

            {aiNote && (
              <Section style={emailStyles.aiSection}>
                <Text style={emailStyles.aiText}>{aiNote}</Text>
              </Section>
            )}

            {(completedTasks.length > 0 || sittingsWorked.length > 0) && (
              <Section>
                <Text style={emailStyles.sectionTitle}>What You Got Done Today</Text>
                {completedTasks.map((task, i) => (
                  <Text key={i} style={emailStyles.listItem}>
                    ✓ {task.title}
                  </Text>
                ))}
                {sittingsWorked.map((sitting, i) => (
                  <Text key={`s${i}`} style={emailStyles.listItem}>
                    ◐ {sitting.title}
                    <span style={emailStyles.deadlineStyle}> · {sitting.detail}</span>
                  </Text>
                ))}
              </Section>
            )}

            {completedTasks.length === 0 && sittingsWorked.length === 0 && (
              <Section>
                <Text style={emailStyles.gentleNote}>
                  {daySubtitle}
                </Text>
              </Section>
            )}

            {tomorrowPriority && (
              <Section>
                <Text style={emailStyles.sectionTitle}>{priorityLabel}</Text>
                <Text style={emailStyles.listItem}>
                  {tomorrowPriority.title}
                  {tomorrowPriority.deadline && (
                    <span style={emailStyles.deadlineStyle}>
                      {" "}
                      (due {tomorrowPriority.deadline})
                    </span>
                  )}
                  {tomorrowPriority.target && (
                    <span style={emailStyles.targetStyle}>
                      {" "}
                      (your target: {tomorrowPriority.target})
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
