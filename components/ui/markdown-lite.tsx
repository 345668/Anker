"use client";

import * as React from "react";

/** Lightweight, dependency-free Markdown for chat answers (bold, italic, code, links, lists, headings, tables). */
export function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const parts = text.split(/```/);
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      const nl = part.indexOf("\n");
      const code = nl >= 0 ? part.slice(nl + 1) : part;
      blocks.push(
        <pre key={`c${i}`} className="my-2 overflow-x-auto rounded-lg bg-muted/70 p-3 text-[13px] leading-relaxed"><code>{code.replace(/\n$/, "")}</code></pre>,
      );
    } else {
      part.split(/\n{2,}/).forEach((para, j) => {
        const t = para.trim();
        if (!t) return;
        const lines = t.split("\n");
        const cells = (l: string) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
        if (lines.length >= 2 && lines.every((l) => l.includes("|")) && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[1])) {
          const head = cells(lines[0]);
          const rows = lines.slice(2).map((l) => { const c = cells(l); return c.length > head.length ? [...c.slice(0, head.length - 1), c.slice(head.length - 1).join(" | ")] : c; });
          blocks.push(
            <div key={`t${i}-${j}`} className="my-2 overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead><tr>{head.map((h, k) => <th key={k} className="border-b border-border px-2 py-1 text-left font-semibold">{inline(h)}</th>)}</tr></thead>
                <tbody>{rows.map((r, k) => <tr key={k}>{head.map((_, c) => <td key={c} className="border-b border-border/50 px-2 py-1 align-top">{inline(r[c] ?? "")}</td>)}</tr>)}</tbody>
              </table>
            </div>,
          );
        } else if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
          blocks.push(<ul key={`u${i}-${j}`} className="my-2 list-disc space-y-1 pl-5">{lines.map((l, k) => <li key={k}>{inline(l.replace(/^\s*[-*]\s+/, ""))}</li>)}</ul>);
        } else if (lines.every((l) => /^\s*\d+\.\s+/.test(l))) {
          blocks.push(<ol key={`o${i}-${j}`} className="my-2 list-decimal space-y-1 pl-5">{lines.map((l, k) => <li key={k}>{inline(l.replace(/^\s*\d+\.\s+/, ""))}</li>)}</ol>);
        } else if (/^#{1,3}\s/.test(t)) {
          const level = t.match(/^#+/)![0].length;
          const content = inline(t.replace(/^#+\s/, ""));
          blocks.push(level === 1 ? <h3 key={`h${i}-${j}`} className="mb-1 mt-3 text-lg font-semibold">{content}</h3> : <h4 key={`h${i}-${j}`} className="mb-1 mt-2 font-semibold">{content}</h4>);
        } else {
          blocks.push(<p key={`p${i}-${j}`} className="my-1.5 whitespace-pre-wrap">{lines.map((l, k) => <span key={k}>{inline(l)}{k < lines.length - 1 && <br />}</span>)}</p>);
        }
      });
    }
  });
  return <>{blocks}</>;
}

/** Inline: **bold**, *italic*, `code`, [text](url). */
function inline(s: string): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0; let m: RegExpExecArray | null; let key = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) nodes.push(s.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) nodes.push(<strong key={key++}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) nodes.push(<code key={key++} className="rounded bg-muted px-1 py-0.5 text-[0.85em]">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("[")) { const mm = tok.match(/\[([^\]]+)\]\(([^)]+)\)/)!; nodes.push(<a key={key++} href={mm[2]} target="_blank" rel="noreferrer" className="text-primary underline">{mm[1]}</a>); }
    else nodes.push(<em key={key++}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < s.length) nodes.push(s.slice(last));
  return nodes;
}
