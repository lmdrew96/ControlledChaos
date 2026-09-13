import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * The ONE markdown renderer for user-written and AI-generated text.
 *
 * Raw HTML in the source is never rendered (react-markdown escapes it, and
 * there is deliberately no rehype-raw), and rehype-sanitize strips anything
 * unsafe that markdown itself can produce — `javascript:` links, for one.
 * Never reach for dangerouslySetInnerHTML to style a string; use this.
 */

const linkComponent: Components["a"] = ({ href, children }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="underline underline-offset-2 hover:text-foreground"
  >
    {children}
  </a>
);

const inlineComponents: Components = {
  // Inline mode lives inside an existing <p>, so paragraphs unwrap.
  p: ({ children }) => <>{children}</>,
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => <em>{children}</em>,
  code: ({ children }) => (
    <code className="rounded bg-muted px-1 font-mono text-[0.85em]">{children}</code>
  ),
  a: linkComponent,
};

const blockComponents: Components = {
  ...inlineComponents,
  p: ({ children }) => <p className="leading-relaxed">{children}</p>,
  h1: ({ children }) => <p className="font-semibold">{children}</p>,
  h2: ({ children }) => <p className="font-semibold">{children}</p>,
  h3: ({ children }) => <p className="font-semibold">{children}</p>,
  h4: ({ children }) => <p className="font-semibold">{children}</p>,
  ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="[&>ol]:mt-1 [&>ul]:mt-1">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-border pl-3 text-muted-foreground">
      {children}
    </blockquote>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded bg-muted p-2 text-xs [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border px-2 py-1 text-left font-semibold">{children}</th>
  ),
  td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
};

const INLINE_ELEMENTS = ["p", "strong", "em", "code", "a", "del"];

interface MarkdownProps {
  children: string;
  /**
   * For short copy inside an existing paragraph (stat sentences, labels):
   * only inline formatting, no block wrappers.
   */
  inline?: boolean;
  className?: string;
}

export function Markdown({ children, inline = false, className }: MarkdownProps) {
  const content = (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSanitize]}
      components={inline ? inlineComponents : blockComponents}
      allowedElements={inline ? INLINE_ELEMENTS : undefined}
      unwrapDisallowed={inline}
    >
      {children}
    </ReactMarkdown>
  );

  if (inline) return content;
  return <div className={cn("space-y-2 break-words", className)}>{content}</div>;
}
