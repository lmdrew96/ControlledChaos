import { Font, Section, Text } from "@react-email/components";

// ControlledChaos runs its own "sunset" palette, distinct from the shared
// ADHDesigns brand tokens — see the comment above --adhd-* in src/app/globals.css.
// Colors below are static hex equivalents of those CSS custom properties
// (email clients don't support var()/color-mix()) so this stays in sync with
// how the app itself actually looks.
export const emailColors = {
  pageBg: "#FFF6F4", // ~ --adhd-bg
  cardBg: "#FFFFFF",
  headerBg: "#16131A", // --adhd-dark
  headerText: "#FFF6F4",
  accent: "#FF5675", // --adhd-amber (coral)
  textPrimary: "#16131A", // --adhd-dark
  textMuted: "#5F4D75", // --adhd-purple (== --muted-foreground in the app)
  aiNoteBg: "#F2EFF4", // --adhd-lavender tinted into white
  aiNoteBorder: "#9378A1", // --adhd-lavender
  border: "#E6DCE8",
  footerText: "#8B7D93",
};

// Fetched from Google Fonts' CSS2 API (fonts.googleapis.com) — latin subset,
// matching the weights the app itself loads in src/app/layout.tsx.
const FRAUNCES_WOFF2 =
  "https://fonts.gstatic.com/s/fraunces/v38/6NUu8FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Wa0K7iN7iQcIfJD58njt0oc7qv8.woff2";
const PLEX_SANS_400_WOFF2 =
  "https://fonts.gstatic.com/s/ibmplexsans/v23/zYXGKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1swZSAXcomDVmadSD6llDB6g4.woff2";
const PLEX_SANS_500_WOFF2 =
  "https://fonts.gstatic.com/s/ibmplexsans/v23/zYXGKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1swZSAXcomDVmadSD2FlDB6g4.woff2";

// Declares the brand webfonts with graceful fallbacks for clients that don't
// support @font-face (most webmail). Must render inside <Head>.
// Each <Font> emits a global `* { font-family: ... }` rule, and the last one
// wins the cascade — order here sets the *default* body font (Plex Sans must
// stay last). Headings get Fraunces only because emailStyles.heading sets an
// explicit inline font-family that overrides the default regardless of order.
export function EmailFonts() {
  return (
    <>
      <Font
        fontFamily="Fraunces"
        fallbackFontFamily={["Georgia", "serif"]}
        webFont={{ url: FRAUNCES_WOFF2, format: "woff2" }}
        fontWeight={600}
        fontStyle="normal"
      />
      <Font
        fontFamily="IBM Plex Sans"
        fallbackFontFamily={["Arial", "sans-serif"]}
        webFont={{ url: PLEX_SANS_400_WOFF2, format: "woff2" }}
        fontWeight={400}
        fontStyle="normal"
      />
      <Font
        fontFamily="IBM Plex Sans"
        fallbackFontFamily={["Arial", "sans-serif"]}
        webFont={{ url: PLEX_SANS_500_WOFF2, format: "woff2" }}
        fontWeight={500}
        fontStyle="normal"
      />
    </>
  );
}

const headerSection = {
  backgroundColor: emailColors.headerBg,
  padding: "20px 32px",
  borderRadius: "12px 12px 0 0",
};

const wordmark = {
  fontFamily: "Fraunces, Georgia, serif",
  fontWeight: 600,
  fontSize: "18px",
  color: emailColors.headerText,
  margin: "0",
};

const wordmarkAccent = {
  color: emailColors.accent,
};

// The branded header band shown at the top of every ControlledChaos email.
export function EmailHeader() {
  return (
    <Section style={headerSection}>
      <Text style={wordmark}>
        Controlled<span style={wordmarkAccent}>Chaos</span>
      </Text>
    </Section>
  );
}

export const emailStyles = {
  main: {
    backgroundColor: emailColors.pageBg,
    fontFamily: "'IBM Plex Sans', Arial, sans-serif",
  },
  container: {
    backgroundColor: emailColors.cardBg,
    margin: "40px auto" as const,
    padding: "0 0 32px",
    borderRadius: "12px",
    maxWidth: "560px",
    overflow: "hidden" as const,
    border: `1px solid ${emailColors.border}`,
  },
  body: {
    padding: "32px 32px 0",
  },
  heading: {
    fontFamily: "Fraunces, Georgia, serif",
    fontSize: "22px",
    fontWeight: "600" as const,
    color: emailColors.textPrimary,
    margin: "0 0 16px",
  },
  aiSection: {
    backgroundColor: emailColors.aiNoteBg,
    borderLeft: `3px solid ${emailColors.aiNoteBorder}`,
    borderRadius: "6px",
    padding: "16px",
    marginBottom: "24px",
  },
  aiText: {
    fontSize: "14px",
    lineHeight: "1.6",
    color: emailColors.textPrimary,
    margin: "0",
  },
  sectionTitle: {
    fontFamily: "'IBM Plex Sans', Arial, sans-serif",
    fontWeight: "500" as const,
    fontSize: "13px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    color: emailColors.textMuted,
    margin: "16px 0 8px",
  },
  listItem: {
    fontSize: "14px",
    lineHeight: "1.5",
    color: emailColors.textPrimary,
    margin: "4px 0",
  },
  gentleNote: {
    fontSize: "14px",
    lineHeight: "1.5",
    color: emailColors.textMuted,
    fontStyle: "italic" as const,
    margin: "8px 0",
  },
  deadlineStyle: {
    color: emailColors.footerText,
    fontSize: "13px",
  },
  hr: {
    borderColor: emailColors.border,
    margin: "24px 0 16px",
  },
  footer: {
    fontSize: "12px",
    color: emailColors.footerText,
    textAlign: "center" as const,
  },
  footerLink: {
    color: emailColors.textMuted,
  },
};

export function priorityDot(priority: string): string {
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
