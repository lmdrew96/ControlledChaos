import { NextResponse } from "next/server";
import { render } from "@react-email/components";
import { MorningDigestEmail } from "@/lib/notifications/emails/morning-digest";
import { EveningDigestEmail } from "@/lib/notifications/emails/evening-digest";

/**
 * GET /api/notifications/preview?type=morning|evening
 * Debug endpoint: renders email template to HTML for browser preview.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "morning";

  let html: string;

  if (type === "evening") {
    html = await render(
      EveningDigestEmail({
        userName: "Nae",
        aiNote:
          "Great work today! You crushed that Bio reading and knocked out two errands. Tomorrow's a fresh canvas.",
        completedTasks: [
          { title: "Read Bio Chapter 12" },
          { title: "Pick up prescriptions" },
          { title: "Reply to Prof. Chen's email" },
        ],
        tomorrowPriority: {
          title: "Study for Linguistics midterm",
          deadline: "Wed, Feb 18",
        },
        settingsUrl: "http://localhost:3000/settings",
      })
    );
  } else {
    html = await render(
      MorningDigestEmail({
        userName: "Nae",
        aiNote:
          "Good morning! You've got a Linguistics lecture at 10 and a Bio quiz at 1pm. Let's knock out that study session first — you've already prepped the notes.",
        todayEvents: [
          { title: "Linguistics 101", time: "10:00 AM" },
          { title: "Bio Quiz", time: "1:00 PM" },
          { title: "Study Group", time: "4:00 PM" },
        ],
        topTasks: [
          { title: "Review Bio Chapter 12 notes", priority: "urgent", deadline: "Today" },
          { title: "Finish Linguistics homework", priority: "important", deadline: "Tomorrow" },
          { title: "Email Prof. Chen about extension", priority: "normal" },
        ],
        deadlinesThisWeek: [
          { title: "Bio Lab Report", deadline: "Wed, Feb 18" },
          { title: "Linguistics Essay Draft", deadline: "Fri, Feb 20" },
        ],
        settingsUrl: "http://localhost:3000/settings",
      })
    );
  }

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}
