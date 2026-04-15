"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

const STORAGE_KEY = "cc-crisis-explainer-seen";

interface CrisisDetectionExplainerProps {
  taskNames?: string[];
}

export function CrisisDetectionExplainer({ taskNames }: CrisisDetectionExplainerProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5">
              <p className="font-medium">Crisis Detection is on</p>
              <p className="text-muted-foreground">
                {taskNames && taskNames.length > 0
                  ? `I noticed ${taskNames.join(" and ")} are colliding with your available time.`
                  : "I noticed some of your deadlines are tighter than your available time."}{" "}
                I&apos;ll keep an eye on conflicts like this.
              </p>
              <p className="text-muted-foreground">
                You can adjust how this works in{" "}
                <Link
                  href="/settings?tab=crisis-detection"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Settings → Crisis Detection
                </Link>
                .
              </p>
            </div>
            <button
              onClick={dismiss}
              className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
