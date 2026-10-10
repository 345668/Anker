"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { ImageIcon, Film, Sparkles, Loader2, Star, Download, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import {
  MODELS,
  modelFor,
  recipeModels,
  isActive,
  type Job,
  type Asset,
  type GenerationInput,
} from "@/lib/ai/studio/catalog"
interface Data {
  scopeKey: string
  ready: boolean
  canGenerate: boolean
  jobs: Job[]
  comfyRecipes?: string[]
  nextCursor: string | null
}
const field =
  "w-full rounded-lg border border-border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
const labels: Record<string, string> = {
  submitting: "Submitting",
  queued: "Queued",
  running: "Generating",
  saving: "Saving your file",
  completed: "Ready",
  failed: "Failed",
  blocked: "Prompt blocked",
  canceled: "Canceled",
  uncertain: "Submission uncertain",
}
const ideas = {
  founder:
    "An editorial image for a climate technology startup: sculptural glass and green energy infrastructure, deep navy and silver, natural light, no text.",
  vc: "An editorial cover for a venture fund outlook: Berlin skyline at blue hour, architectural lines, deep navy and silver, no text.",
  lp: "An abstract cover for a private markets report: translucent glass, balanced geometry, silver and deep navy, no text.",
}
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init }),
    d = await r.json().catch(() => null)
  if (!r.ok) throw new Error(d?.error || `Request failed (${r.status}). Try again.`)
  if (!d) throw new Error("Unreadable server response.")
  return d as T
}
function Preview({ asset, large = false }: { asset: Asset; large?: boolean }) {
  const [failed, setFailed] = useState(false)
  if (failed)
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Preview unavailable.{" "}
        <a className="underline" href={`${asset.url}?download=1`}>
          Try downloading
        </a>
      </p>
    )
  const css = `w-full bg-muted object-contain ${large ? "max-h-[60vh]" : "aspect-video"}`
  return asset.kind === "video" ? (
    <video
      src={asset.url}
      controls
      playsInline
      preload="metadata"
      aria-label="Generated video"
      className={css}
      onError={() => setFailed(true)}
    />
  ) : (
    <img
      src={asset.url}
      alt="AI-generated artwork"
      loading="lazy"
      className={css}
      onError={() => setFailed(true)}
    />
  )
}
export function MediaStudio({ scopeKey, persona }: { scopeKey: string; persona: "founder" | "vc" | "lp" }) {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true)
  const [modelId, setModel] = useState("qwen-image-2.0"),
    [prompt, setPrompt] = useState(""),
    [ratio, setRatio] = useState("1:1"),
    [resolution, setResolution] = useState(modelFor("qwen-image-2.0")!.resolutions[0] as string)
  const [duration, setDuration] = useState(5),
    [audio, setAudio] = useState(false),
    [enhance, setEnhance] = useState(false),
    [source, setSource] = useState<Asset | null>(null),
    [negative, setNegative] = useState(""),
    [seed, setSeed] = useState(""),
    [voiceMode, setVoiceMode] = useState<"none" | "upload" | "dialogue">("none"),
    [voiceAsset, setVoiceAsset] = useState<Asset | null>(null),
    [speaking, setSpeaking] = useState(false),
    [lines, setLines] = useState<Array<{ voice: string; text: string }>>([
      { voice: "Cherry", text: "" },
      { voice: "Ethan", text: "" },
    ])
  const [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [filter, setFilter] = useState("all"),
    [more, setMore] = useState(false),
    [pollError, setPollError] = useState(""),
    [pollAttempt, setPollAttempt] = useState(0)
  const lock = useRef(false),
    pending = useRef<{ value: string; key: string } | null>(null),
    promptRef = useRef<HTMLTextAreaElement>(null),
    uploadRef = useRef<HTMLInputElement>(null),
    audioUploadRef = useRef<HTMLInputElement>(null)
  const m = modelFor(modelId)!,
    query = `scopeKey=${encodeURIComponent(scopeKey)}`
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      setError("")
      try {
        const d = await api<Data>(`/api/anker/studio?scopeKey=${encodeURIComponent(scopeKey)}`, { signal })
        if (d.scopeKey !== scopeKey) throw new Error("Workspace changed. Reload Anker AI.")
        setData(d)
      } catch (e) {
        if (!signal?.aborted) setError((e as Error).message)
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [scopeKey],
  )
  useEffect(() => {
    const c = new AbortController()
    void load(c.signal)
    return () => c.abort()
  }, [load])
  const merge = useCallback(
    (job: Job) =>
      setData((p) =>
        p
          ? {
              ...p,
              jobs: p.jobs.some((j) => j.id === job.id)
                ? p.jobs.map((j) => (j.id === job.id ? job : j))
                : [job, ...p.jobs],
            }
          : p,
      ),
    [],
  )
  const active =
    data?.jobs
      .filter((j) => isActive(j.status))
      .map((j) => j.id)
      .join(",") || ""
  useEffect(() => {
    if (!active) return
    const c = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    let misses = 0
    const poll = async () => {
      if (document.visibilityState === "hidden") {
        timer = setTimeout(poll, 8000)
        return
      }
      try {
        const r = await Promise.all(
          active
            .split(",")
            .map((id) =>
              api<{ scopeKey: string; job: Job }>(
                `/api/anker/studio/${id}?scopeKey=${encodeURIComponent(scopeKey)}`,
                { signal: c.signal },
              ),
            ),
        )
        if (c.signal.aborted) return
        if (r.some((v) => v.scopeKey !== scopeKey)) throw new Error("Workspace changed. Reload Anker AI.")
        r.forEach((v) => merge(v.job))
        setPollError("")
        misses = 0
      } catch (e) {
        if (c.signal.aborted) return
        misses++
        setPollError(`${(e as Error).message} Jobs continue on the server.`)
      }
      if (!c.signal.aborted && misses < 5) timer = setTimeout(poll, misses ? 30000 : 8000)
    }
    timer = setTimeout(poll, 2000)
    return () => {
      c.abort()
      clearTimeout(timer)
    }
  }, [active, scopeKey, merge, pollAttempt])
  function choose(id: string) {
    const next = modelFor(id)!
    setModel(id)
    setRatio(next.ratios[0])
    setResolution(next.resolutions[0])
    setDuration(5)
    setAudio(false)
    setEnhance(false)
    if (!next.canSource) setSource(null)
    if (!next.voice) {
      setVoiceMode("none")
      setVoiceAsset(null)
    }
    if (!next.negative) setNegative("")
    if (!next.seed) setSeed("")
    setDuration((d) => (next.kind === "video" ? Math.min(Math.max(d, next.min), next.max) : d))
  }
  /** A voice track sets the video's length, so speech and picture end together. */
  function attachVoice(a: Asset | null) {
    setVoiceAsset(a)
    if (a?.durationMs && m.kind === "video")
      setDuration(Math.min(m.max, Math.max(m.min, Math.ceil(a.durationMs / 1000))))
  }
  async function speak() {
    setSpeaking(true)
    setError("")
    try {
      const body = JSON.stringify({
        scopeKey,
        lines: lines.filter((l) => l.text.trim()).map((l) => ({ voice: l.voice, text: l.text.trim() })),
      })
      attachVoice(
        (
          await api<{ asset: Asset }>("/api/anker/studio/speech", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          })
        ).asset,
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSpeaking(false)
    }
  }
  async function uploadAudio(file: File | undefined) {
    if (!file) return
    if (file.size > 15 * 1024 * 1024 || !/\.(wav|mp3)$/i.test(file.name)) {
      setError("Choose a WAV or MP3 under 15 MB.")
      return
    }
    setUploading(true)
    setError("")
    try {
      const body = new FormData()
      body.set("scopeKey", scopeKey)
      body.set("kind", "audio")
      body.set("file", file)
      attachVoice(
        (
          await api<{ asset: Asset }>("/api/anker/studio/upload", {
            method: "POST",
            body,
          })
        ).asset,
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
      if (audioUploadRef.current) audioUploadRef.current.value = ""
    }
  }
  function reuse(j: Job) {
    choose(j.model)
    setPrompt(j.prompt)
    setRatio(j.settings.aspectRatio)
    setResolution(j.settings.resolution)
    setDuration(j.settings.duration || 5)
    setAudio(j.settings.audio)
    setEnhance(j.settings.enhancePrompt)
    setSource(
      j.settings.sourceAssetId
        ? {
            id: j.settings.sourceAssetId,
            kind: "image",
            name: "Original start frame",
            url: `/api/anker/studio/assets/${j.settings.sourceAssetId}`,
          }
        : null,
    )
    promptRef.current?.focus()
  }
  async function submit() {
    if (
      lock.current ||
      uploading ||
      speaking ||
      !data?.ready ||
      !data.canGenerate ||
      !prompt.trim() ||
      (m.needsSource && !source)
    )
      return
    lock.current = true
    setBusy(true)
    setError("")
    const input: Omit<GenerationInput, "requestKey"> = {
      scopeKey,
      model: modelId,
      prompt: prompt.trim(),
      aspectRatio: ratio,
      resolution,
      audio,
      enhancePrompt: enhance,
      ...(m.kind === "video" ? { duration } : {}),
      ...(source && m.canSource ? { sourceAssetId: source.id } : {}),
      ...(negative.trim() && m.negative ? { negativePrompt: negative.trim() } : {}),
      ...(seed.trim() !== "" && m.seed ? { seed: Number(seed) } : {}),
      ...(voiceAsset && m.voice ? { audioAssetId: voiceAsset.id } : {}),
    }
    const value = JSON.stringify(input)
    if (pending.current?.value !== value) pending.current = { value, key: crypto.randomUUID() }
    try {
      merge(
        (
          await api<{ job: Job }>("/api/anker/studio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...input, requestKey: pending.current.key }),
          })
        ).job,
      )
      pending.current = null
    } catch (e) {
      setError(
        `${(e as Error).message} If interrupted, submitting unchanged settings checks the same request.`,
      )
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  async function upload(file: File | undefined) {
    if (!file) return
    if (file.size > 3 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Choose a PNG, JPG or WebP under 3 MB.")
      return
    }
    setUploading(true)
    setError("")
    try {
      const body = new FormData()
      body.set("scopeKey", scopeKey)
      body.set("file", file)
      setSource(
        (
          await api<{ asset: Asset }>("/api/anker/studio/upload", {
            method: "POST",
            body,
          })
        ).asset,
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
      if (uploadRef.current) uploadRef.current.value = ""
    }
  }
  async function favorite(j: Job) {
    try {
      merge(
        (
          await api<{ job: Job }>(`/api/anker/studio/${j.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scopeKey, favorite: !j.favorite }),
          })
        ).job,
      )
    } catch (e) {
      setError((e as Error).message)
    }
  }
  async function older() {
    if (!data?.nextCursor) return
    setMore(true)
    try {
      const d = await api<Data>(`/api/anker/studio?${query}&before=${encodeURIComponent(data.nextCursor)}`)
      if (d.scopeKey !== scopeKey) throw new Error("Workspace changed. Reload Anker AI.")
      setData((p) =>
        p
          ? {
              ...p,
              jobs: [...p.jobs, ...d.jobs.filter((j) => !p.jobs.some((v) => v.id === j.id))],
              nextCursor: d.nextCursor,
            }
          : p,
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setMore(false)
    }
  }
  const jobs =
    data?.jobs.filter(
      (j) => filter === "all" || filter === j.kind || (filter === "favorites" && j.favorite),
    ) || []
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
      <header className="mb-8 border-b pb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Anker AI / Creative studio
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Make your next idea visible.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Create images and short films for pitches, updates and campaigns. Your creations stay private to
          your account in this workspace.
        </p>
      </header>
      {error && (
        <div
          role="alert"
          className="mb-5 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
        >
          {error}
          {!data && (
            <Button size="sm" variant="outline" className="ml-3" onClick={() => void load()}>
              Try again
            </Button>
          )}
        </div>
      )}
      {loading && !data ? (
        <p role="status" className="py-16 text-center">
          Loading your studio…
        </p>
      ) : (
        data && (
          <>
            {!data.ready && (
              <p role="status" className="mb-5 rounded-lg border bg-muted/40 p-4 text-sm">
                Media Studio needs administrator setup. Your chat and saved media remain available.
              </p>
            )}
            {!data.canGenerate && (
              <p className="mb-5 text-sm text-muted-foreground">
                Your role can view saved media. Ask an owner for generation access.
              </p>
            )}
            <div className="grid gap-8 lg:grid-cols-[350px_minmax(0,1fr)]">
              <section aria-label="Generation settings" className="self-start rounded-xl border bg-card p-5">
                <div className="mb-6 flex gap-2">
                  {(["image", "video"] as const).map((k) => (
                    <Button
                      key={k}
                      type="button"
                      className="flex-1 gap-2"
                      variant={m.kind === k ? "default" : "outline"}
                      aria-pressed={m.kind === k}
                      onClick={() => choose(k === "image" ? "qwen-image-2.0" : "wan2.7")}
                    >
                      {k === "image" ? <ImageIcon className="size-4" /> : <Film className="size-4" />}
                      {k === "image" ? "Image" : "Video"}
                    </Button>
                  ))}
                </div>
                <form
                  className="space-y-5"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void submit()
                  }}
                >
                  <label className="block text-sm font-medium">
                    Model
                    <select
                      className={`${field} mt-2`}
                      value={modelId}
                      onChange={(e) => choose(e.target.value)}
                    >
                      {[...MODELS, ...recipeModels().filter((r) => data?.comfyRecipes?.includes(r.id))]
                        .filter((v) => v.kind === m.kind)
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="block text-sm font-medium">
                    Describe your {m.kind}
                    <textarea
                      ref={promptRef}
                      className={`${field} mt-2 min-h-40 resize-y`}
                      required
                      maxLength={4000}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Subject, scene, lighting and visual style…"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault()
                          void submit()
                        }
                      }}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-sm">
                      Aspect ratio
                      <select
                        className={`${field} mt-2`}
                        value={ratio}
                        disabled={!!source && m.kind === "video"}
                        onChange={(e) => setRatio(e.target.value)}
                      >
                        {m.ratios.map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      Resolution
                      <select
                        className={`${field} mt-2`}
                        value={resolution}
                        onChange={(e) => setResolution(e.target.value)}
                      >
                        {m.resolutions.map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {m.kind === "video" && (
                    <label className="block text-sm">
                      Duration (seconds)
                      <input
                        className={`${field} mt-2`}
                        type="number"
                        min={m.min}
                        max={m.max}
                        step={1}
                        value={duration}
                        onChange={(e) => setDuration(Number(e.target.value))}
                      />
                    </label>
                  )}
                  {m.audio && (
                    <label className="flex gap-2 text-sm">
                      <input type="checkbox" checked={audio} onChange={(e) => setAudio(e.target.checked)} />
                      Generate audio
                    </label>
                  )}
                  {m.enhance && (
                    <label className="flex gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={enhance}
                        onChange={(e) => setEnhance(e.target.checked)}
                      />
                      Enhance prompt
                    </label>
                  )}
                  {m.negative && (
                    <label className="block text-sm">
                      Leave out <span className="font-normal text-muted-foreground">(optional)</span>
                      <input
                        className={`${field} mt-2`}
                        maxLength={500}
                        value={negative}
                        onChange={(e) => setNegative(e.target.value)}
                        placeholder="blurry, distorted text, extra fingers…"
                      />
                    </label>
                  )}
                  {m.seed && (
                    <label className="block text-sm">
                      Seed{" "}
                      <span className="font-normal text-muted-foreground">(optional, repeats a take)</span>
                      <input
                        className={`${field} mt-2`}
                        type="number"
                        min={0}
                        max={2147483647}
                        value={seed}
                        onChange={(e) => setSeed(e.target.value)}
                      />
                    </label>
                  )}
                  {m.voice && (
                    <div className="space-y-3 rounded-lg border p-3">
                      <p className="text-sm font-medium">
                        Voices{" "}
                        <span className="font-normal text-muted-foreground">
                          (speech and lip movement follow this track)
                        </span>
                      </p>
                      <div className="flex gap-1">
                        {(
                          [
                            ["none", "None"],
                            ["dialogue", "Write dialogue"],
                            ["upload", "Upload audio"],
                          ] as const
                        ).map(([id, label]) => (
                          <Button
                            key={id}
                            type="button"
                            size="sm"
                            variant={voiceMode === id ? "secondary" : "ghost"}
                            aria-pressed={voiceMode === id}
                            onClick={() => {
                              setVoiceMode(id)
                              if (id === "none") attachVoice(null)
                            }}
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                      {voiceMode === "dialogue" && (
                        <div className="space-y-3">
                          {lines.map((l, i) => (
                            <div key={i} className="space-y-1">
                              <div className="flex items-center gap-2">
                                <select
                                  aria-label={`Voice for line ${i + 1}`}
                                  className={`${field} !p-2`}
                                  value={l.voice}
                                  onChange={(e) =>
                                    setLines((p) =>
                                      p.map((x, j) => (j === i ? { ...x, voice: e.target.value } : x)),
                                    )
                                  }
                                >
                                  {["Cherry", "Serena", "Jennifer", "Ethan", "Ryan", "Aiden"].map((v) => (
                                    <option key={v}>{v}</option>
                                  ))}
                                </select>
                                {lines.length > 1 && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Remove line ${i + 1}`}
                                    onClick={() => setLines((p) => p.filter((_, j) => j !== i))}
                                  >
                                    <X className="size-4" />
                                  </Button>
                                )}
                              </div>
                              <textarea
                                aria-label={`Line ${i + 1}`}
                                className={`${field} min-h-16 resize-y`}
                                maxLength={300}
                                value={l.text}
                                placeholder="What this person says…"
                                onChange={(e) =>
                                  setLines((p) =>
                                    p.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)),
                                  )
                                }
                              />
                            </div>
                          ))}
                          <div className="flex gap-2">
                            {lines.length < 8 && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setLines((p) => [
                                    ...p,
                                    {
                                      voice: p[p.length - 1]?.voice === "Ethan" ? "Cherry" : "Ethan",
                                      text: "",
                                    },
                                  ])
                                }
                              >
                                Add a line
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              disabled={
                                speaking ||
                                uploading ||
                                !data.ready ||
                                !data.canGenerate ||
                                !lines.some((l) => l.text.trim())
                              }
                              onClick={() => void speak()}
                            >
                              {speaking ? "Recording…" : "Create voice track"}
                            </Button>
                          </div>
                        </div>
                      )}
                      {voiceMode === "upload" && (
                        <>
                          <input
                            ref={audioUploadRef}
                            type="file"
                            className="sr-only"
                            accept=".wav,.mp3,audio/wav,audio/mpeg"
                            aria-label="Upload voice track"
                            onChange={(e) => void uploadAudio(e.target.files?.[0])}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full gap-2"
                            disabled={uploading || busy || !data.ready || !data.canGenerate}
                            onClick={() => audioUploadRef.current?.click()}
                          >
                            <Upload className="size-4" />
                            {uploading ? "Uploading…" : "Upload WAV or MP3 · 2–30 s"}
                          </Button>
                        </>
                      )}
                      {voiceAsset && (
                        <div className="space-y-1">
                          <audio controls src={voiceAsset.url} className="w-full" aria-label="Voice track" />
                          <p className="text-xs text-muted-foreground">
                            {voiceAsset.durationMs
                              ? `${(voiceAsset.durationMs / 1000).toFixed(1)} s · the video length follows it. `
                              : ""}
                            <button type="button" className="underline" onClick={() => attachVoice(null)}>
                              Remove
                            </button>
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  {m.canSource && (
                    <div className="space-y-3">
                      <p className="text-sm font-medium">
                        {m.needsSource ? "Image to edit" : "Start frame"}{" "}
                        {!m.needsSource && (
                          <span className="font-normal text-muted-foreground">(optional)</span>
                        )}
                      </p>
                      {source && (
                        <div className="flex items-center gap-3 rounded-lg border p-2">
                          <img
                            src={source.url}
                            alt="Selected start frame"
                            className="size-14 rounded object-cover"
                          />
                          <p className="min-w-0 flex-1 truncate text-xs">{source.name}</p>
                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            aria-label="Remove start frame"
                            onClick={() => setSource(null)}
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                      )}
                      <p className="text-xs leading-5 text-muted-foreground">
                        Upload a frame or animate a saved image. Video framing follows your image.
                      </p>
                      <input
                        ref={uploadRef}
                        type="file"
                        className="sr-only"
                        accept="image/png,image/jpeg,image/webp"
                        aria-label="Upload start frame"
                        onChange={(e) => void upload(e.target.files?.[0])}
                      />
                      <Button
                        className="w-full gap-2"
                        variant="outline"
                        type="button"
                        disabled={uploading || busy || !data.ready || !data.canGenerate}
                        onClick={() => uploadRef.current?.click()}
                      >
                        <Upload className="size-4" />
                        {uploading ? "Uploading…" : "Upload image · under 3 MB"}
                      </Button>
                    </div>
                  )}
                  <p className="text-xs leading-5 text-muted-foreground">
                    Your prompt and any start frame are sent to the generation provider. Each request creates
                    one result and may incur provider charges. Review outputs before publishing.
                  </p>
                  <Button
                    type="submit"
                    className="w-full gap-2"
                    disabled={
                      busy ||
                      uploading ||
                      speaking ||
                      !data.ready ||
                      !data.canGenerate ||
                      !prompt.trim() ||
                      (m.needsSource && !source)
                    }
                  >
                    {busy ? (
                      <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                    {busy ? "Submitting…" : `Generate ${m.kind}`}
                  </Button>
                </form>
              </section>
              <section aria-label="Your creations" className="min-w-0">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">Your creations</h2>
                  <div className="flex flex-wrap gap-1">
                    {[
                      ["all", "All"],
                      ["image", "Images"],
                      ["video", "Videos"],
                      ["favorites", "Favorites"],
                    ].map(([id, label]) => (
                      <Button
                        key={id}
                        size="sm"
                        variant={filter === id ? "secondary" : "ghost"}
                        aria-pressed={filter === id}
                        onClick={() => setFilter(id)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
                {pollError && (
                  <div role="status" className="mb-4 rounded-lg border p-3 text-sm">
                    {pollError}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPollError("")
                        setPollAttempt((v) => v + 1)
                      }}
                    >
                      Check again
                    </Button>
                  </div>
                )}
                {!jobs.length ? (
                  <div className="rounded-xl border border-dashed px-6 py-14 text-center">
                    <ImageIcon className="mx-auto mb-4 size-8 text-muted-foreground" />
                    <h3 className="text-lg font-medium">
                      {filter === "favorites" ? "Keep your best work here" : "Start with an idea"}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {filter === "favorites"
                        ? "Star a creation to find it here."
                        : "Try a starting point made for your work."}
                    </p>
                    {filter !== "favorites" && (
                      <button
                        className="mx-auto mt-6 block max-w-md rounded-lg border p-4 text-left text-sm leading-6 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => {
                          choose("qwen-image-2.0")
                          setPrompt(ideas[persona])
                          promptRef.current?.focus()
                        }}
                      >
                        Create an editorial cover
                        <span className="mt-1 block text-xs text-muted-foreground">{ideas[persona]}</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-5 xl:grid-cols-2">
                    {jobs.map((j) => (
                      <article key={j.id} className="overflow-hidden rounded-xl border bg-card">
                        {j.assets[0] ? (
                          <Preview asset={j.assets[0]} />
                        ) : (
                          <div
                            className="flex aspect-video flex-col items-center justify-center gap-3 bg-muted/30"
                            role="status"
                          >
                            {isActive(j.status) ? (
                              <Loader2 className="size-6 animate-spin motion-reduce:animate-none" />
                            ) : (
                              <ImageIcon className="size-6" />
                            )}
                            <p className="text-sm">{labels[j.status]}</p>
                          </div>
                        )}
                        <div className="space-y-3 p-4">
                          <div className="flex items-start gap-2">
                            <p className="line-clamp-3 flex-1 text-sm leading-6">{j.prompt}</p>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={j.favorite ? "Remove from favorites" : "Add to favorites"}
                              aria-pressed={j.favorite}
                              onClick={() => void favorite(j)}
                            >
                              <Star className={`size-4 ${j.favorite ? "fill-current" : ""}`} />
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {modelFor(j.model)?.name} · {j.settings.resolution} ·{" "}
                            {new Date(j.createdAt).toLocaleDateString()}
                          </p>
                          {j.error && <p className="text-xs leading-5 text-destructive">{j.error}</p>}
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => reuse(j)}>
                              Reuse prompt
                            </Button>
                            {j.assets[0] && (
                              <>
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button size="sm" variant="outline">
                                      Open
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto motion-reduce:animate-none">
                                    <DialogTitle>{modelFor(j.model)?.name} creation</DialogTitle>
                                    <DialogDescription className="line-clamp-3">{j.prompt}</DialogDescription>
                                    <Preview asset={j.assets[0]} large />
                                    <a className="text-sm underline" href={`${j.assets[0].url}?download=1`}>
                                      Download original
                                    </a>
                                  </DialogContent>
                                </Dialog>
                                <Button asChild size="sm" variant="outline">
                                  <a href={`${j.assets[0].url}?download=1`}>
                                    <Download className="mr-1 size-3" />
                                    Download
                                  </a>
                                </Button>
                                {j.kind === "image" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      choose("wan2.7")
                                      setSource(j.assets[0])
                                      setPrompt(
                                        "Slow cinematic camera movement. Preserve the subject and visual style of this image.",
                                      )
                                      promptRef.current?.focus()
                                    }}
                                  >
                                    Animate
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                          <p className="select-all text-[10px] text-muted-foreground">Job {j.id}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
                {data.nextCursor && (
                  <Button className="mt-6" variant="outline" disabled={more} onClick={() => void older()}>
                    {more ? "Loading…" : "Load older creations"}
                  </Button>
                )}
                <p className="mt-6 text-xs leading-5 text-muted-foreground">
                  Jobs continue when you leave. Up to 3 active jobs, 20 requests per person and 30 per
                  workspace daily. Filters apply to loaded history.
                </p>
              </section>
            </div>
          </>
        )
      )}
    </main>
  )
}
