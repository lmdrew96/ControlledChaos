import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { LegalFooter } from "@/components/layout/legal-footer";

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
        Last updated: March 26, 2026
      </p>

      <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            The short version
          </h2>
          <p>
            We don&apos;t sell, share, or exploit your data. Your information
            exists solely to make the app work for you. That&apos;s it.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            1. Data accessed via Google sign-in
          </h2>
          <p className="mb-3">
            ControlledChaos uses Google OAuth (via Clerk, our authentication
            provider) to let you sign in with your Google account. When you
            choose this sign-in method, we access the following Google account
            data:
          </p>
          <ul className="ml-4 list-disc space-y-2">
            <li>
              <span className="text-foreground">Email address</span> &mdash;
              used to identify your account and send optional digest emails.
            </li>
            <li>
              <span className="text-foreground">Name</span> &mdash; used to
              personalize the app interface.
            </li>
            <li>
              <span className="text-foreground">Profile picture</span> &mdash;
              used as your avatar in the app.
            </li>
          </ul>
          <p className="mt-3">
            We do <span className="text-foreground">not</span> access your
            Google Calendar, Gmail, Google Drive, contacts, or any other Google
            service. Our Google OAuth scope is limited to basic profile
            information only (
            <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">
              openid
            </code>
            ,{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">
              email
            </code>
            ,{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">
              profile
            </code>
            ).
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            2. How we use your data
          </h2>
          <p className="mb-3">
            Everything we access is used exclusively to operate the app on your
            behalf:
          </p>
          <ul className="ml-4 list-disc space-y-2">
            <li>
              <span className="text-foreground">
                Authenticate and identify your account
              </span>{" "}
              &mdash; so you can sign in securely and your data stays yours.
            </li>
            <li>
              <span className="text-foreground">Personalize your dashboard</span>{" "}
              &mdash; your name and avatar appear in the app interface.
            </li>
            <li>
              <span className="text-foreground">Send optional email digests</span>{" "}
              &mdash; morning and evening summaries of your tasks, if you enable
              them. You can turn these off at any time in Settings.
            </li>
            <li>
              <span className="text-foreground">
                Power AI features (brain dump, task recommendations)
              </span>{" "}
              &mdash; the content you type or speak is sent to Anthropic&apos;s
              Claude API to parse tasks and suggest priorities. Your Google
              account data is never included in these AI requests.
            </li>
          </ul>
          <p className="mt-3">
            We do not use your data for advertising, behavioral tracking, or
            any purpose beyond operating ControlledChaos for you.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            3. Data sharing
          </h2>
          <p className="mb-3">
            We do not sell, rent, or share your personal data with third
            parties for their own purposes. Full stop.
          </p>
          <p className="mb-3">
            The only data transfers that occur are to infrastructure providers
            that process data strictly on our behalf to operate the service:
          </p>
          <ul className="ml-4 list-disc space-y-2">
            <li>
              <span className="text-foreground">Clerk</span> &mdash; handles
              authentication, including Google OAuth. They manage your login
              session securely.
            </li>
            <li>
              <span className="text-foreground">Anthropic (Claude)</span> &mdash;
              receives the content of your brain dumps and task context to
              generate AI responses. Your name, email, and Google profile are
              never sent.
            </li>
            <li>
              <span className="text-foreground">Groq (Whisper)</span> &mdash;
              receives audio recordings for voice brain dumps. Audio is
              transcribed and immediately discarded — not retained.
            </li>
            <li>
              <span className="text-foreground">Cloudflare R2</span> &mdash;
              temporarily stores voice recordings during transcription. Files
              are deleted after processing.
            </li>
            <li>
              <span className="text-foreground">Neon</span> &mdash; hosts our
              PostgreSQL database where your tasks, goals, and settings are
              stored.
            </li>
            <li>
              <span className="text-foreground">Resend</span> &mdash; delivers
              email digests if you have them enabled.
            </li>
          </ul>
          <p className="mt-3">
            Each provider receives only the minimum data necessary to perform
            their specific function. None of them receive your full profile or
            activity history.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            4. Data storage &amp; protection
          </h2>
          <p className="mb-3">
            Your data is stored in a hosted PostgreSQL database (Neon) with
            SSL-encrypted connections. Authentication is managed by Clerk, which
            uses industry-standard security practices including encrypted token
            storage and secure session management.
          </p>
          <p className="mb-3">
            Data stored server-side includes: your tasks, brain dumps, goals,
            calendar events, and app preferences. This data is only accessible
            to your authenticated account.
          </p>
          <p>
            Location data (if you enable location-based task recommendations)
            is processed in your browser only. Your coordinates are compared
            client-side against your saved location labels &mdash; only the
            matching label (e.g. &ldquo;home&rdquo; or &ldquo;campus&rdquo;) is
            sent to the server. Your precise location is never stored.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            5. Data retention &amp; deletion
          </h2>
          <p className="mb-3">
            Your data is retained for as long as your account is active. We do
            not delete your tasks, goals, or history automatically &mdash; that
            would defeat the purpose of the app.
          </p>
          <p className="mb-3">
            You can request complete deletion of your account and all associated
            data at any time. To do so, email us at{" "}
            <a
              href="mailto:nae@adhdesigns.dev"
              className="text-foreground underline underline-offset-4"
            >
              nae@adhdesigns.dev
            </a>{" "}
            with the subject line &ldquo;Delete my account.&rdquo; We will
            wipe your data within 30 days. There are no hidden backups &mdash;
            when it&apos;s gone, it&apos;s gone.
          </p>
          <p>
            Voice recordings are deleted immediately after transcription.
            Session tokens expire according to Clerk&apos;s standard session
            lifecycle.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            AI processing
          </h2>
          <p>
            When you submit a brain dump or request a task recommendation, your
            input is sent to Anthropic&apos;s Claude API for processing. This is
            handled according to{" "}
            <a
              href="https://www.anthropic.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-4"
            >
              Anthropic&apos;s privacy policy
            </a>
            . Your data is not used to train AI models.
          </p>
          <p className="mt-2">
            Voice brain dumps are transcribed using Groq&apos;s Whisper API.
            Audio is processed for transcription only and is not retained by
            Groq after processing.
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
            <li>
              We don&apos;t access your Google Calendar, Gmail, or any Google
              service beyond basic sign-in.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            Cookies
          </h2>
          <p>
            We use only essential cookies required for authentication and
            session management (set by Clerk). No tracking cookies, no
            analytics cookies, no third-party advertising cookies.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            Changes to this policy
          </h2>
          <p>
            If we change this policy in a meaningful way, we&apos;ll notify you
            through the app. We&apos;ll never quietly reduce your privacy
            protections.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            Contact
          </h2>
          <p>
            Questions or concerns about this policy? Reach out at{" "}
            <a
              href="mailto:nae@adhdesigns.dev"
              className="text-foreground underline underline-offset-4"
            >
              nae@adhdesigns.dev
            </a>
          </p>
        </section>
      </div>
      <LegalFooter className="mt-12 pt-8 border-t border-border" />
    </div>
  );
}
