import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | ControlledChaos",
};

export default function PrivacyPolicyPage() {
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
        Privacy Policy
      </h1>
      <p className="mb-10 text-sm text-muted-foreground">
        Last updated: February 16, 2026
      </p>

      <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            The short version
          </h2>
          <p>
            We don&apos;t collect, share, or sell your personal data. Your
            information exists solely to make the app work for you. That&apos;s
            it.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            What we store
          </h2>
          <ul className="ml-4 list-disc space-y-2">
            <li>
              <span className="text-foreground">Account info</span> &mdash;
              your email address and name, provided through Clerk (our
              authentication provider) when you sign up.
            </li>
            <li>
              <span className="text-foreground">Your content</span> &mdash;
              brain dumps, tasks, calendar events, goals, and preferences you
              create in the app.
            </li>
            <li>
              <span className="text-foreground">Settings</span> &mdash; your
              timezone, energy profile, notification preferences, and connected
              integrations.
            </li>
          </ul>
          <p className="mt-3">
            All of this is stored in our database and is only accessible by you.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            What we don&apos;t do
          </h2>
          <ul className="ml-4 list-disc space-y-2">
            <li>We don&apos;t sell your data. Ever.</li>
            <li>We don&apos;t share your data with advertisers.</li>
            <li>We don&apos;t use your data to train AI models.</li>
            <li>We don&apos;t track you across the web.</li>
            <li>We don&apos;t show you ads.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            AI processing
          </h2>
          <p>
            When you submit a brain dump or request a task recommendation, your
            input is sent to Anthropic&apos;s Claude API for processing. This
            data is used solely to generate a response and is handled according
            to{" "}
            <a
              href="https://www.anthropic.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-4"
            >
              Anthropic&apos;s privacy policy
            </a>
            . Your data is not used for model training.
          </p>
          <p className="mt-2">
            Voice brain dumps are transcribed using Groq&apos;s Whisper API.
            Audio is processed for transcription only and is not retained by
            Groq after processing.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            Third-party services
          </h2>
          <ul className="ml-4 list-disc space-y-2">
            <li>
              <span className="text-foreground">Clerk</span> &mdash;
              authentication. Handles your login securely.
            </li>
            <li>
              <span className="text-foreground">Anthropic (Claude)</span>{" "}
              &mdash; AI processing for brain dump parsing and task
              recommendations.
            </li>
            <li>
              <span className="text-foreground">Groq (Whisper)</span> &mdash;
              voice transcription for voice brain dumps.
            </li>
            <li>
              <span className="text-foreground">
                Google Calendar &amp; Canvas
              </span>{" "}
              &mdash; optional calendar integrations you can connect and
              disconnect at any time.
            </li>
            <li>
              <span className="text-foreground">Cloudflare R2</span> &mdash;
              temporary storage for voice recordings during transcription.
            </li>
            <li>
              <span className="text-foreground">Neon</span> &mdash; PostgreSQL
              database hosting.
            </li>
          </ul>
          <p className="mt-3">
            Each service processes only the minimum data needed for its
            function. None of them receive your full profile or activity
            history.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            Location data
          </h2>
          <p>
            If you enable location-based task recommendations, your approximate
            location is used in-browser to match tasks to your current context
            (home, campus, work). Location data is not stored on our servers
            &mdash; it&apos;s compared client-side against your saved location
            labels and only the matching label is sent to the API.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            Cookies
          </h2>
          <p>
            We use only essential cookies required for authentication and
            session management. No tracking cookies, no analytics cookies, no
            third-party cookies.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            Data deletion
          </h2>
          <p>
            You can request complete deletion of your account and all associated
            data at any time. Email us and we&apos;ll wipe everything within 30
            days. There are no backups we &quot;forgot&quot; to delete &mdash;
            when it&apos;s gone, it&apos;s gone.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            Changes to this policy
          </h2>
          <p>
            If we change this policy, we&apos;ll notify you through the app.
            We&apos;ll never quietly reduce your privacy protections.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            Contact
          </h2>
          <p>
            Questions or concerns? Reach out at{" "}
            <a
              href="mailto:nae@adhdesigns.dev"
              className="text-foreground underline underline-offset-4"
            >
              nae@adhdesigns.dev
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
