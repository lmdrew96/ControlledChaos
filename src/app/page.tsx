"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import Link from "next/link";
import {
  ArrowRight,
  Zap,
  CalendarDays,
  BellRing,
  CheckCircle2,
  Mic,
  Camera,
  Type,
  Clock,
  BatteryMedium,
  MapPin,
  Sparkles,
  ChevronRight,
} from "lucide-react";

// ─── Brain Dump Demo ───────────────────────────────────────────────────────────

const DUMP_TEXT =
  "bio lab due friday need to email prof about grade + grocery run milk eggs bread + moms birthday is next tuesday gift?? + english paper outline due monday help + rent";

const PARSED_TASKS = [
  { title: "Study for Bio Lab", tag: "Academic", priority: "high", due: "Due Friday" },
  { title: "Email Professor", tag: "Academic", priority: "medium", due: "Today" },
  { title: "Groceries: milk, eggs, bread", tag: "Personal", priority: "low", due: "This week" },
  { title: "Mom's Birthday Gift", tag: "Personal", priority: "high", due: "Due Tuesday" },
  { title: "English Paper Outline", tag: "Academic", priority: "high", due: "Due Monday" },
];

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-rose-500/15 text-rose-400 border-rose-500/20",
  medium: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  low: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
};

type DemoPhase = "typing" | "processing" | "done";

function BrainDumpDemo() {
  const [phase, setPhase] = useState<DemoPhase>("typing");
  const [typedText, setTypedText] = useState("");
  const [visibleTasks, setVisibleTasks] = useState(0);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    if (phase === "typing") {
      setTypedText("");
      let i = 0;
      const interval = setInterval(() => {
        setTypedText(DUMP_TEXT.slice(0, i + 1));
        i++;
        if (i >= DUMP_TEXT.length) {
          clearInterval(interval);
          timeout = setTimeout(() => setPhase("processing"), 800);
        }
      }, 28);
      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }

    if (phase === "processing") {
      timeout = setTimeout(() => {
        setVisibleTasks(0);
        setPhase("done");
      }, 1600);
      return () => clearTimeout(timeout);
    }

    if (phase === "done") {
      let count = 0;
      const interval = setInterval(() => {
        count++;
        setVisibleTasks(count);
        if (count >= PARSED_TASKS.length) {
          clearInterval(interval);
          timeout = setTimeout(() => setPhase("typing"), 4000);
        }
      }, 180);
      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }
  }, [phase]);

  return (
    <div className="relative w-full max-w-lg mx-auto">
      {/* Window chrome */}
      <div className="rounded-2xl border border-white/8 bg-[oklch(0.18_0_0)] shadow-2xl overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/8 bg-[oklch(0.16_0_0)]">
          <div className="w-2.5 h-2.5 rounded-full bg-rose-500/70" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
          <span className="ml-2 text-xs text-white/30 font-mono">brain dump</span>
        </div>

        {/* Content */}
        <div className="p-5 min-h-[280px] flex flex-col gap-3">
          <AnimatePresence mode="wait">
            {phase === "typing" && (
              <motion.div
                key="typing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col gap-3"
              >
                <p className="text-xs text-white/30 font-mono uppercase tracking-widest">
                  dump anything
                </p>
                <div className="rounded-xl bg-white/5 border border-white/8 p-4 min-h-[120px]">
                  <p className="text-sm text-white/70 leading-relaxed font-mono">
                    {typedText}
                    <span className="inline-block w-0.5 h-4 bg-amber-400 ml-0.5 animate-pulse" />
                  </p>
                </div>
              </motion.div>
            )}

            {phase === "processing" && (
              <motion.div
                key="processing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center flex-1 gap-4 py-8"
              >
                <div className="relative w-10 h-10">
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-amber-400/30"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    style={{ borderTopColor: "oklch(0.75 0.15 75)" }}
                  />
                  <Sparkles className="absolute inset-0 m-auto w-4 h-4 text-amber-400" />
                </div>
                <p className="text-sm text-white/40 font-mono">parsing your chaos…</p>
              </motion.div>
            )}

            {phase === "done" && (
              <motion.div
                key="done"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col gap-2"
              >
                <p className="text-xs text-white/30 font-mono uppercase tracking-widest mb-1">
                  {PARSED_TASKS.length} tasks found
                </p>
                {PARSED_TASKS.slice(0, visibleTasks).map((task, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25 }}
                    className="flex items-center gap-3 rounded-lg bg-white/5 border border-white/8 px-3 py-2.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-white/20 shrink-0" />
                    <span className="text-sm text-white/80 flex-1 truncate">{task.title}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${PRIORITY_STYLES[task.priority]}`}>
                      {task.due}
                    </span>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Glow */}
      <div className="absolute -inset-6 -z-10 rounded-3xl bg-amber-500/5 blur-2xl" />
    </div>
  );
}

// ─── Fade-in wrapper ───────────────────────────────────────────────────────────

function FadeIn({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: <Type className="w-5 h-5" />,
    title: "Brain Dump",
    description:
      "Type, speak, or photograph anything on your mind. Text, voice, photos — all of it. AI extracts the actual tasks.",
    extras: ["Text", "Voice", "Photo"],
  },
  {
    icon: <Zap className="w-5 h-5" />,
    title: "Do This Next",
    description:
      "One recommendation. Not a list. Based on your energy level, location, and how long you have until your next commitment.",
    extras: ["Energy-aware", "Location-aware", "Reasoning included"],
  },
  {
    icon: <CalendarDays className="w-5 h-5" />,
    title: "Your Schedule",
    description:
      "Canvas iCal and Google Calendar, unified. AI schedules task time blocks around your actual life.",
    extras: ["Canvas iCal", "Google Calendar", "AI scheduling"],
  },
  {
    icon: <BellRing className="w-5 h-5" />,
    title: "Timely Nudges",
    description:
      "Deadline reminders before panic sets in. Morning digest to prime your day. Evening wrap-up to close the loop.",
    extras: ["Push notifications", "Morning digest", "Evening recap"],
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="dark min-h-screen bg-[oklch(0.145_0_0)] text-[oklch(0.985_0_0)] overflow-x-hidden">
      {/* Ambient blobs */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute top-0 left-[10%] w-[600px] h-[500px] rounded-full bg-[oklch(0.78_0.12_85/15%)] blur-[120px]" />
        <div className="absolute bottom-[20%] right-[5%] w-[400px] h-[400px] rounded-full bg-[oklch(0.65_0.08_185/12%)] blur-[100px]" />
        <div className="absolute top-[40%] left-[50%] w-[300px] h-[300px] rounded-full bg-[oklch(0.75_0.10_75/8%)] blur-[80px]" />
      </div>

      {/* ── Nav ── */}
      <header className="fixed top-0 inset-x-0 z-50 border-b border-white/6 bg-[oklch(0.145_0_0/80%)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-xs font-semibold tracking-tight sm:text-sm">
            <span className="text-[oklch(0.75_0.15_75)]">●</span>
            ControlledChaos
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/sign-in"
              className="px-2.5 py-1.5 text-xs text-white/50 transition-colors hover:text-white/80 sm:px-3 sm:text-sm"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="flex items-center gap-1.5 rounded-lg bg-[oklch(0.75_0.15_75)] px-3 py-1.5 text-xs font-medium text-[oklch(0.12_0_0)] transition-colors hover:bg-[oklch(0.72_0.16_75)] sm:px-4 sm:text-sm"
            >
              Get started
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className="pt-32 pb-20 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col lg:flex-row lg:items-center gap-16 lg:gap-12">
              {/* Left: copy */}
              <div className="flex-1 max-w-xl">
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <span className="inline-flex items-center gap-2 text-xs font-mono text-[oklch(0.75_0.15_75)] border border-[oklch(0.75_0.15_75/30%)] bg-[oklch(0.75_0.15_75/8%)] px-3 py-1.5 rounded-full mb-8">
                    <span className="w-1.5 h-1.5 rounded-full bg-[oklch(0.75_0.15_75)] animate-pulse" />
                    Now in beta
                  </span>
                </motion.div>

                <motion.h1
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.1, ease: [0.21, 0.47, 0.32, 0.98] }}
                  className="mb-6 text-4xl font-bold tracking-tight leading-[1.08] sm:text-6xl"
                >
                  Your brain has
                  <br />
                  the ideas.
                  <br />
                  <span className="text-[oklch(0.75_0.15_75)]">I&apos;ll handle the rest.</span>
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="text-base text-white/50 leading-relaxed mb-10 max-w-md"
                >
                  An AI executive function companion built for ADHD brains. Dump your thoughts,
                  get structured tasks, and let AI figure out what to do next — so you don&apos;t have to.
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  className="flex flex-wrap items-center gap-3"
                >
                  <Link
                    href="/sign-up"
                    className="inline-flex items-center gap-2 bg-[oklch(0.75_0.15_75)] hover:bg-[oklch(0.72_0.16_75)] text-[oklch(0.12_0_0)] font-semibold px-6 py-3 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                  >
                    Start for free
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  <span className="text-xs text-white/25">No credit card needed</span>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="flex items-center gap-6 mt-10"
                >
                  {[
                    { icon: <Type className="w-3.5 h-3.5" />, label: "Text" },
                    { icon: <Mic className="w-3.5 h-3.5" />, label: "Voice" },
                    { icon: <Camera className="w-3.5 h-3.5" />, label: "Photo" },
                  ].map(({ icon, label }) => (
                    <div key={label} className="flex items-center gap-1.5 text-xs text-white/30">
                      {icon}
                      {label}
                    </div>
                  ))}
                  <div className="flex items-center gap-1.5 text-xs text-white/30">
                    <Sparkles className="w-3.5 h-3.5" />
                    AI-parsed
                  </div>
                </motion.div>
              </div>

              {/* Right: demo */}
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.2, ease: [0.21, 0.47, 0.32, 0.98] }}
                className="flex-1 w-full"
              >
                <BrainDumpDemo />
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── Problem ── */}
        <section className="py-24 px-6">
          <div className="max-w-3xl mx-auto text-center">
            <FadeIn>
              <p className="text-xs font-mono text-white/30 uppercase tracking-widest mb-8">
                sound familiar?
              </p>
            </FadeIn>
            <FadeIn delay={0.1}>
              <h2 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight mb-6">
                You know what needs to get done.
                <br />
                <span className="text-white/40">Your brain just won&apos;t let you start.</span>
              </h2>
            </FadeIn>
            <FadeIn delay={0.2}>
              <p className="text-white/45 text-lg leading-relaxed mb-6">
                So you open a productivity app. Make a list. Feel overwhelmed by the list.
                Close the app. The cycle continues.
              </p>
            </FadeIn>
            <FadeIn delay={0.3}>
              <p className="text-white/70 text-lg leading-relaxed">
                ControlledChaos doesn&apos;t give you another list to manage.
                It takes the chaos out of your head and figures out{" "}
                <span className="text-[oklch(0.75_0.15_75)]">what to do right now</span>, with the
                energy you actually have, in the time you actually have.
              </p>
            </FadeIn>
          </div>
        </section>

        {/* ── Features ── */}
        <section className="py-24 px-6">
          <div className="max-w-6xl mx-auto">
            <FadeIn className="text-center mb-16">
              <p className="text-xs font-mono text-white/30 uppercase tracking-widest mb-4">
                how it works
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                Everything your brain wishes it could offload
              </h2>
            </FadeIn>

            <div className="grid sm:grid-cols-2 gap-4">
              {FEATURES.map((feature, i) => (
                <FadeIn key={feature.title} delay={i * 0.08}>
                  <div className="group relative rounded-2xl border border-white/8 bg-white/3 hover:bg-white/5 p-6 transition-all duration-300 h-full">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-[oklch(0.75_0.15_75/12%)] border border-[oklch(0.75_0.15_75/20%)] flex items-center justify-center text-[oklch(0.75_0.15_75)] shrink-0">
                        {feature.icon}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-base mb-2">{feature.title}</h3>
                        <p className="text-sm text-white/45 leading-relaxed mb-4">
                          {feature.description}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {feature.extras.map((e) => (
                            <span
                              key={e}
                              className="text-[10px] font-mono text-white/30 border border-white/10 px-2 py-0.5 rounded-full"
                            >
                              {e}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    {/* Subtle hover glow */}
                    <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,oklch(0.75_0.15_75/6%),transparent)]" />
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </section>

        {/* ── Context-aware recommendation ── */}
        <section className="py-24 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="rounded-3xl border border-white/8 bg-white/3 p-10 sm:p-16 relative overflow-hidden">
              {/* Background accent */}
              <div className="absolute top-0 right-0 w-80 h-80 rounded-full bg-[oklch(0.75_0.15_75/6%)] blur-[80px] pointer-events-none" />

              <div className="relative flex flex-col lg:flex-row gap-12 lg:gap-16 items-center">
                <div className="flex-1 max-w-md">
                  <FadeIn>
                    <p className="text-xs font-mono text-[oklch(0.75_0.15_75)] uppercase tracking-widest mb-4">
                      AI Recommendation
                    </p>
                    <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-5">
                      One task.
                      <br />
                      <span className="text-white/40">Not a list.</span>
                    </h2>
                    <p className="text-white/45 leading-relaxed">
                      Every time you open the app, you get one clear answer: do this next.
                      Based on your energy, location, time until your next commitment,
                      and task priorities — not just what&apos;s due soonest.
                    </p>
                  </FadeIn>
                </div>

                {/* Recommendation card mockup */}
                <FadeIn delay={0.15} className="flex-1 w-full max-w-sm mx-auto">
                  <div className="rounded-2xl border border-white/10 bg-[oklch(0.18_0_0)] p-5">
                    <p className="text-xs font-mono text-white/25 uppercase tracking-widest mb-4">
                      Do This Next
                    </p>
                    <div className="rounded-xl bg-[oklch(0.75_0.15_75/10%)] border border-[oklch(0.75_0.15_75/20%)] p-4 mb-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <h4 className="font-semibold text-base">Study for Bio Lab</h4>
                        <span className="text-[10px] font-mono text-[oklch(0.75_0.15_75)] bg-[oklch(0.75_0.15_75/12%)] px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                          High priority
                        </span>
                      </div>
                      <p className="text-xs text-white/40 leading-relaxed">
                        Due tomorrow and you&apos;re near campus with 90 minutes free. This is
                        the highest-leverage thing you can do right now.
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-white/30">
                      <div className="flex items-center gap-1.5">
                        <BatteryMedium className="w-3.5 h-3.5" />
                        Medium energy
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        90 min free
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5" />
                        Campus
                      </div>
                    </div>
                  </div>
                </FadeIn>
              </div>
            </div>
          </div>
        </section>

        {/* ── No guilt ── */}
        <section className="py-24 px-6">
          <div className="max-w-4xl mx-auto text-center">
            <FadeIn>
              <p className="text-xs font-mono text-white/30 uppercase tracking-widest mb-10">
                our promise
              </p>
            </FadeIn>

            <div className="grid sm:grid-cols-3 gap-px bg-white/8 rounded-2xl overflow-hidden mb-16">
              {[
                { label: "No streaks.", sub: "Your value isn't measured in consecutive days." },
                { label: "No shame.", sub: "The app is patient. It waits for you." },
                { label: "No lectures.", sub: "\"You missed yesterday\" isn't here." },
              ].map((item, i) => (
                <FadeIn key={item.label} delay={i * 0.1}>
                  <div className="bg-[oklch(0.145_0_0)] px-8 py-10">
                    <p className="text-xl font-bold mb-2 line-through decoration-[oklch(0.75_0.15_75)] decoration-2">
                      {item.label}
                    </p>
                    <p className="text-sm text-white/40 leading-relaxed">{item.sub}</p>
                  </div>
                </FadeIn>
              ))}
            </div>

            <FadeIn delay={0.3}>
              <p className="text-2xl sm:text-3xl font-bold tracking-tight text-white/70 leading-snug">
                Built by an ADHD brain,
                <br />
                <span className="text-white">for every ADHD brain.</span>
              </p>
            </FadeIn>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="py-24 px-6">
          <FadeIn>
            <div className="max-w-2xl mx-auto text-center rounded-3xl border border-white/8 bg-white/3 p-14 relative overflow-hidden">
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_100%,oklch(0.75_0.15_75/10%),transparent)]" />
              </div>
              <div className="relative">
                <p className="text-4xl sm:text-5xl font-bold tracking-tight mb-5 leading-tight">
                  Your brain already
                  <br />
                  works hard enough.
                </p>
                <p className="text-white/45 mb-10 max-w-sm mx-auto leading-relaxed">
                  Let&apos;s make everything else easier. Free to start, no credit card required.
                </p>
                <Link
                  href="/sign-up"
                  className="inline-flex items-center gap-2.5 bg-[oklch(0.75_0.15_75)] hover:bg-[oklch(0.72_0.16_75)] text-[oklch(0.12_0_0)] font-semibold text-base px-8 py-4 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  Get started — it&apos;s free
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </FadeIn>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-white/6 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-white/25">
            <span className="text-[oklch(0.75_0.15_75)]">●</span>
            ControlledChaos
          </div>
          <div className="flex items-center gap-6 text-xs text-white/25">
            <Link href="/privacy" className="hover:text-white/50 transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-white/50 transition-colors">
              Terms
            </Link>
            <Link href="/sign-in" className="hover:text-white/50 transition-colors">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
