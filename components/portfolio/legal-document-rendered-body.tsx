"use client"

/**
 * Legal & Compliance — rendered document body.
 *
 * The renderer in legal-template-renderer.ts emits a Markdown body
 * with three kinds of inline spans:
 *
 *   <span data-tbd="field_key">[ Label · TBD ]</span>
 *   <span data-filled-approved="field_key">value</span>
 *   <span data-filled-pending="field_key">value</span>
 *
 * This component converts that body to React nodes:
 *   - TBD spans become Link pills (?field=<key>) styled amber/rose
 *   - filled-approved spans become emerald inline text
 *   - filled-pending spans become amber inline text
 *
 * We do NOT pull in react-markdown or remark (heavy + the templates
 * use a tight Markdown subset). The line-by-line scanner here handles
 * headings, blockquotes, tables, lists, and our 3 marker spans. Good
 * enough for the audit-grade documents we're rendering.
 */

import Link from "next/link"
import React from "react"

interface Props {
  body: string
  editorBase: string
}

export function LegalDocumentRenderedBody({ body, editorBase }: Props) {
  // Two-step parse: render Markdown structure first, then walk the
  // resulting React tree converting inline marker spans.
  return (
    <div className="legal-doc prose-doc text-background">
      <style>{`
        .prose-doc { line-height: 1.7; font-size: 0.95rem; }
        .prose-doc h1 { font-size: 1.5rem; font-weight: 600; margin: 1.5rem 0 0.75rem; }
        .prose-doc h2 { font-size: 1.25rem; font-weight: 600; margin: 1.5rem 0 0.5rem; padding-bottom: 0.25rem; border-bottom: 1px solid rgba(255,255,255,0.1); }
        .prose-doc h3 { font-size: 1rem; font-weight: 600; margin: 1.25rem 0 0.4rem; }
        .prose-doc p { margin: 0.7rem 0; }
        .prose-doc strong { color: rgba(255,255,255,0.95); font-weight: 600; }
        .prose-doc em { color: rgba(255,255,255,0.75); font-style: italic; }
        .prose-doc ul, .prose-doc ol { margin: 0.5rem 0 0.5rem 1.5rem; }
        .prose-doc li { margin: 0.25rem 0; }
        .prose-doc hr { margin: 1.5rem 0; border-color: rgba(255,255,255,0.1); }
        .prose-doc table { border-collapse: collapse; margin: 1rem 0; width: 100%; }
        .prose-doc th, .prose-doc td { border: 1px solid rgba(255,255,255,0.1); padding: 0.4rem 0.6rem; text-align: left; font-size: 0.85rem; }
        .prose-doc th { background: rgba(255,255,255,0.04); font-weight: 600; }
      `}</style>
      {renderMarkdown(body, editorBase)}
    </div>
  )
}

// ── markdown renderer ──────────────────────────────────────────────────-

function renderMarkdown(md: string, editorBase: string): React.ReactNode[] {
  const lines = md.split("\n")
  const out: React.ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    // Blank line → paragraph break.
    if (line.trim() === "") { i++; continue }

    // Heading.
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    if (h) {
      const level = h[1].length
      const Tag = (`h${level}` as unknown) as keyof React.JSX.IntrinsicElements
      out.push(<Tag key={key++}>{renderInline(h[2], editorBase, key)}</Tag>)
      i++; continue
    }

    // Horizontal rule.
    if (/^---+$/.test(line.trim())) {
      out.push(<hr key={key++} />)
      i++; continue
    }

    // Table.
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?[-:|\s]+\|/.test(lines[i + 1])) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].includes("|")) {
        tableLines.push(lines[i])
        i++
      }
      out.push(renderTable(tableLines, editorBase, key++))
      continue
    }

    // Unordered list.
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""))
        i++
      }
      out.push(
        <ul key={key++}>
          {items.map((it, ix) => <li key={ix}>{renderInline(it, editorBase, ix)}</li>)}
        </ul>,
      )
      continue
    }

    // Ordered list.
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""))
        i++
      }
      out.push(
        <ol key={key++}>
          {items.map((it, ix) => <li key={ix}>{renderInline(it, editorBase, ix)}</li>)}
        </ol>,
      )
      continue
    }

    // Paragraph — collect consecutive non-blank lines.
    const para: string[] = []
    while (i < lines.length && lines[i].trim() !== "" && !/^#{1,4}\s/.test(lines[i]) && !/^---+$/.test(lines[i].trim()) && !/^[-*]\s/.test(lines[i]) && !/^\d+\.\s/.test(lines[i])) {
      para.push(lines[i])
      i++
    }
    if (para.length > 0) {
      out.push(<p key={key++}>{renderInline(para.join(" "), editorBase, key)}</p>)
    }
  }
  return out
}

function renderTable(lines: string[], editorBase: string, key: number): React.ReactNode {
  // First line = header, second = separator, rest = body.
  const splitRow = (l: string) => l.split("|").map(c => c.trim()).filter((_, ix, arr) => ix !== 0 || arr[0] !== "").filter((_, ix, arr) => ix !== arr.length - 1 || arr[arr.length - 1] !== "")
  const header = splitRow(lines[0])
  const rows = lines.slice(2).map(splitRow)
  return (
    <table key={key}>
      <thead>
        <tr>{header.map((h, ix) => <th key={ix}>{renderInline(h, editorBase, ix)}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, rix) => (
          <tr key={rix}>{r.map((c, cix) => <td key={cix}>{renderInline(c, editorBase, cix)}</td>)}</tr>
        ))}
      </tbody>
    </table>
  )
}

// ── inline parser: bold + italic + our 3 marker span types ───────────-

const SPAN_RE = /<span\s+data-(tbd|filled-approved|filled-pending)="([a-z0-9_]+)">([^<]*)<\/span>/i
const BOLD_RE = /\*\*([^*]+)\*\*/
const ITAL_RE = /\*([^*]+)\*/
const ESCAPED_UNDERSCORE_RE = /\\_/g

function renderInline(text: string, editorBase: string, key: number): React.ReactNode {
  // Unescape signature-line underscores up front.
  let working = text.replace(ESCAPED_UNDERSCORE_RE, "_")
  const out: React.ReactNode[] = []
  let k = 0
  while (working.length > 0) {
    // First find the earliest of: span marker, bold, italic.
    const candidates: Array<{ idx: number; len: number; kind: "span" | "bold" | "ital"; m: RegExpExecArray }> = []
    const sp = SPAN_RE.exec(working)
    if (sp) candidates.push({ idx: sp.index, len: sp[0].length, kind: "span", m: sp })
    const bo = BOLD_RE.exec(working)
    if (bo) candidates.push({ idx: bo.index, len: bo[0].length, kind: "bold", m: bo })
    const it = ITAL_RE.exec(working)
    if (it) candidates.push({ idx: it.index, len: it[0].length, kind: "ital", m: it })
    if (candidates.length === 0) {
      out.push(working)
      break
    }
    candidates.sort((a, b) => a.idx - b.idx)
    const next = candidates[0]
    if (next.idx > 0) out.push(working.slice(0, next.idx))
    if (next.kind === "span") {
      const [, kind, fieldKey, content] = next.m
      out.push(renderMarker(kind, fieldKey, content, editorBase, `${key}-${k++}`))
    } else if (next.kind === "bold") {
      out.push(<strong key={`${key}-${k++}`}>{next.m[1]}</strong>)
    } else {
      out.push(<em key={`${key}-${k++}`}>{next.m[1]}</em>)
    }
    working = working.slice(next.idx + next.len)
  }
  return out
}

function renderMarker(kind: string, fieldKey: string, content: string, editorBase: string, key: string): React.ReactNode {
  if (kind === "tbd") {
    return (
      <Link
        key={key}
        href={`${editorBase}?field=${encodeURIComponent(fieldKey)}`}
        className="inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.5 text-[11px] font-mono uppercase tracking-wider border border-amber-500/40 bg-amber-500/10 text-amber-200 rounded hover:bg-amber-500/15 align-baseline"
        title="Click to fill this field in the editor"
      >
        {content}
      </Link>
    )
  }
  if (kind === "filled-approved") {
    return (
      <span
        key={key}
        className="px-0.5 text-emerald-300"
        title={`${fieldKey} · approved`}
      >
        {content}
      </span>
    )
  }
  // filled-pending
  return (
    <span
      key={key}
      className="px-0.5 text-amber-200"
      title={`${fieldKey} · filled, awaiting approval`}
    >
      {content}
    </span>
  )
}
