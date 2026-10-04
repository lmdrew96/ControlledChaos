"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

/**
 * The hosted MCP server's sign-in endpoint (the `mcp/` project, deployed to
 * Vercel). One URL for everyone: the AI app sends the person through
 * ControlledChaos sign-in, and the token it gets back says whose data to use.
 */
const MCP_URL = "https://controlledchaos-mcp.vercel.app/mcp";

const CLAUDE_CODE_COMMAND = `claude mcp add --transport http controlledchaos ${MCP_URL}`;

const CopyButton = ({ text, label }: { text: string; label: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleCopy}
      className="shrink-0"
      aria-label={label}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-success" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </Button>
  );
};

const Step = ({ app, children }: { app: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    <p className="text-sm font-medium">{app}</p>
    <div className="space-y-2 text-xs text-muted-foreground">{children}</div>
  </div>
);

export function AiConnectSettings() {
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Let Claude (or another AI assistant that supports MCP connectors) see and
        update your tasks, calendar, goals, brain dumps and journal. You sign in
        with your ControlledChaos account. There&rsquo;s no key to copy or keep safe.
      </p>

      <div className="space-y-1.5">
        <span className="text-sm font-medium">Connector link</span>
        <div className="flex items-center gap-2">
          <Input
            value={MCP_URL}
            readOnly
            aria-label="Connector link"
            className="font-mono text-xs"
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <CopyButton text={MCP_URL} label="Copy connector link" />
        </div>
      </div>

      <div className="space-y-4">
        <Step app="Claude (web, desktop, or mobile)">
          <p>
            Settings → Connectors → <strong>Add custom connector</strong>. Name it
            ControlledChaos, paste the link, then press <strong>Connect</strong> and
            sign in.
          </p>
        </Step>

        <Step app="Claude Code">
          <p>Run this in your terminal, then type /mcp in Claude Code to sign in:</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-md border border-border bg-muted px-2.5 py-2 font-mono text-xs text-foreground">
              {CLAUDE_CODE_COMMAND}
            </code>
            <CopyButton text={CLAUDE_CODE_COMMAND} label="Copy Claude Code command" />
          </div>
        </Step>

        <Step app="ChatGPT and other apps">
          <p>
            Add a custom connector (in ChatGPT it&rsquo;s under Settings → Apps, and may
            need Developer mode turned on first), paste the link, and sign in when
            asked.
          </p>
        </Step>
      </div>

      <p className="text-xs text-muted-foreground">
        To disconnect, remove the connector in that app.
      </p>
    </div>
  );
}
