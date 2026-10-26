"use client";

import { useState } from "react";
import type { Interview } from "@/lib/marketing/partners";
import p from "./partners.module.css";

/** The video id of a YouTube address, or null. Only YouTube is embedded, and only from the privacy-friendly address. */
export function youTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    if (u.hostname === "youtu.be") return /^[\w-]{11}$/.test(u.pathname.slice(1)) ? u.pathname.slice(1) : null;
    if (/^(www\.|m\.)?youtube\.com$/.test(u.hostname)) {
      const v = u.searchParams.get("v") ?? (u.pathname.startsWith("/embed/") ? u.pathname.slice(7) : null);
      return v && /^[\w-]{11}$/.test(v) ? v : null;
    }
  } catch { /* not a URL */ }
  return null;
}

/**
 * An interview with a poster and a Play button. The video loads only after the click, from youtube-nocookie.com, so nothing is requested from a third party on page load.
 * Renders nothing when there is no source.
 */
export function InterviewEmbed({ interview }: { interview: Interview }) {
  const [playing, setPlaying] = useState(false);
  if (!interview.url) return null;
  const id = youTubeId(interview.url);
  return (
    <section className={p.interview} aria-labelledby="interview-title">
      <span className="sr-only">Interview</span>
      <h3 id="interview-title" className={p.wordmark}>{interview.title}</h3>
      <p className={p.pending}>{interview.speakers}{interview.date ? `, ${interview.date}` : ""}</p>
      {id ? (
        <div className={p.frame}>
          {playing ? (
            <iframe src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1`} title={interview.title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
          ) : (
            <button type="button" className={p.play} onClick={() => setPlaying(true)}>Play the interview</button>
          )}
        </div>
      ) : null}
      <p><a href={interview.url} rel="noopener noreferrer">Watch the original</a>{interview.sourceNote ? ` · ${interview.sourceNote}` : ""}</p>
      {interview.transcript ? (
        <details className={p.transcript}><summary>Read the transcript</summary><pre>{interview.transcript}</pre></details>
      ) : null}
    </section>
  );
}
