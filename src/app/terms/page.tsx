import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | ControlledChaos",
};

export default function TermsOfServicePage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      <h1 className="mb-2 text-3xl font-bold tracking-tight">
        Terms of Service
      </h1>
      <p className="mb-10 text-sm text-muted-foreground">
        Last updated: February 16, 2026
      </p>

      <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            What this is
          </h2>
          <p>
            ControlledChaos is an AI-powered executive function companion
            designed for people with ADHD. It helps you capture thoughts, organize
            tasks, and figure out what to do next. These terms govern your use
            of the app.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            Your account
          </h2>
          <p>
            You need an account to use ControlledChaos. You&apos;re responsible
            for keeping your login credentials secure. If you suspect
            unauthorized access, let us know immediately.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            Your data belongs to you
          </h2>
          <p>
            Everything you put into ControlledChaos &mdash; brain dumps, tasks,
            calendar events, settings &mdash; is yours. We don&apos;t sell,
            share, or monetize your data. Period. See our{" "}
            <Link href="/privacy" className="text-foreground underline underline-offset-4">
              Privacy Policy
            </Link>{" "}
            for full details.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            AI processing
          </h2>
          <p>
            ControlledChaos uses AI (via Anthropic&apos;s Claude) to parse your
            brain dumps, recommend tasks, and generate calendar events. Your
            input is sent to the AI for processing and is not stored by the AI
            provider beyond what&apos;s needed to generate a response. We never
            use your data to train AI models.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            Third-party integrations
          </h2>
          <p>
            You can optionally connect Google Calendar and Canvas. When you do,
            we access only the calendar data needed to sync your events.
            You can disconnect these integrations at any time from your
            settings, and we&apos;ll stop accessing that data.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            Acceptable use
          </h2>
          <p>
            Use ControlledChaos for its intended purpose: organizing your life.
            Don&apos;t use it to do anything illegal, harmful, or that
            interferes with the service for others.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            The app is provided as-is
          </h2>
          <p>
            ControlledChaos is a work in progress. We do our best to keep it
            running smoothly, but we can&apos;t guarantee 100% uptime or that
            everything will always work perfectly. We&apos;re not liable for
            missed tasks, scheduling errors, or decisions you make based on AI
            recommendations.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            Deleting your account
          </h2>
          <p>
            You can request deletion of your account and all associated data at
            any time. We&apos;ll remove everything within 30 days.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            Changes to these terms
          </h2>
          <p>
            If we update these terms, we&apos;ll let you know through the app.
            Continued use after changes means you accept the updated terms.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            Contact
          </h2>
          <p>
            Questions? Reach out at{" "}
            <a
              href="mailto:nae@controlledchaos.app"
              className="text-foreground underline underline-offset-4"
            >
              nae@controlledchaos.app
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
