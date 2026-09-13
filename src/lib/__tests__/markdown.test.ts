import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "@/components/ui/markdown";

const render = (md: string, inline = false) =>
  renderToStaticMarkup(
    createElement(Markdown, { inline } as { inline: boolean; children: string }, md)
  );

// Shaped like a real structured Haiku crisis-chat reply: numbered steps with a
// nested list, bold inside a list item, inline code, a link, a blockquote, a
// GFM table, a fenced block with a language tag, multiple paragraphs.
const HAIKU_REPLY = [
  "Okay, here's the move for tonight — two things, in this order:",
  "",
  "1. **Draft the intro** for the *Bio lab report* (about 20 min)",
  "2. Knock out `Problem Set 4`:",
  "   - Q1–Q3 first",
  "   - save Q4 for [office hours](https://example.edu/oh) — **don't** grind on it",
  "",
  "> It doesn't need to be perfect. It needs to be submitted.",
  "",
  "| Task | Time |",
  "|------|------|",
  "| Lab intro | 20m |",
  "| PS4 Q1–Q3 | 45m |",
  "",
  "```python",
  "print(`backticks` inside)",
  "```",
  "",
  "That still leaves you a buffer before midnight.",
].join("\n");

describe("Markdown renderer", () => {
  it("renders a structured AI reply as real elements, not raw markup", () => {
    const html = render(HAIKU_REPLY);

    expect(html).not.toContain("**");
    expect(html).toMatch(/<ol[^>]*>/);
    expect(html).toContain("Draft the intro</strong>");
    expect(html).toContain("<em>Bio lab report</em>");
    expect(html).toMatch(/<code[^>]*>Problem Set 4<\/code>/);
    // nested list inside a list item
    expect(html).toMatch(/<li[^>]*>[^]*?<ul[^>]*>[^]*?Q1–Q3 first/);
    // bold inside a list item that also holds a link
    expect(html).toMatch(/<a href="https:\/\/example\.edu\/oh"[^>]*>office hours<\/a>/);
    expect(html).toContain("don&#x27;t</strong>");
    expect(html).toMatch(/<blockquote[^>]*>/);
    expect(html).toMatch(/<table[^>]*>/);
    expect(html).toMatch(/<pre[^>]*>/);
    expect(html).toContain("`backticks` inside");
    expect(html.match(/<p[^>]*>/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("never renders raw HTML or script-y links from the source", () => {
    const html = render(
      'Hi <script>alert(1)</script> <img src=x onerror="alert(2)"> [click](javascript:alert(3))'
    );
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toContain("javascript:");
  });

  it("inline mode styles bold without adding block wrappers", () => {
    const html = render("You have **3** sitting longer — not overdue, just marinating.", true);
    expect(html).toContain("3</strong>");
    expect(html).not.toMatch(/<p[\s>]/);
    expect(html).not.toMatch(/<div[\s>]/);
  });

  it("inline mode flattens block syntax instead of emitting lists or headings", () => {
    const html = render("# Heading\n\n- item", true);
    expect(html).not.toMatch(/<(h1|ul|li)[\s>]/);
    expect(html).toContain("Heading");
    expect(html).toContain("item");
  });
});
