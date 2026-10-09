# 48. Media Studio v2: voice-synced video and the wider Qwen Cloud model range

**Decision (founder, 2026-10-09):** videos need voices that match the picture, the studio should carry the controls video generation needs, and every Qwen Cloud image and video model that fits belongs in it. Builds on doc 47.

## What video generation needs that the studio lacked
1. **A voice track.** Wan 2.7 takes an audio file (`input.audio_url` for text-to-video, a `driving_audio` media item for image-to-video; WAV or MP3, 2 to 30 seconds, up to 15 MB) and drives the speech and lip movement from it. Without one it invents music and effects. So the studio gets an audio asset kind and two ways to supply it: **upload** a WAV or MP3, or **write dialogue** and have it spoken.
2. **Dialogue to speech.** Qwen3-TTS (`qwen3-tts-flash`) speaks each line in a chosen voice. The server joins the lines in order into one 24 kHz mono WAV with a pause between speakers (plain PCM concatenation, no ffmpeg), stores it as a private audio asset, and returns its length. At most 8 lines, 300 characters each, 30 seconds in all.
3. **Negative prompt and seed** for the models that take them, so a good take can be repeated and unwanted things excluded.
4. **A start frame that is required** for the image-edit models, optional for image-to-video.
5. **Honest limits in the form:** each model declares what it accepts (ratios, resolutions, durations, voice, negative prompt, seed, source image); the form shows only those, and the server refuses the rest.

## Models (ids as in `lib/ai/model-catalog.ts`)
- **Image:** Qwen-Image 2.0, 2.0 Pro, Max, Plus; Z-Image Turbo; Wan 2.6 Text-to-Image; Wan 2.7 Image Pro; and the edit models Qwen-Image-Edit Plus and Max (source image required). Sizes are per family because each has its own allowed pixel sizes.
- **Video:** Wan 2.7 (text-to-video, or image-to-video with a start frame; 2 to 15 s; 720p or 1080p; voice track); HappyHorse 1.1 (text-to-video, or image-to-video with a start frame; 3 to 15 s; 720p or 1080p). Reference-to-video and video-edit models need reference clips and are left out for now.
- A model's parameter shape that was not confirmed against the provider's documentation is tested once live before it is relied on; a refusal for settings is a clean `failed` with no charge.

## How the audio reaches the provider
The same capability-link pattern as start frames: a 256-bit token whose hash is stored on the job, valid two hours, serving one audio asset. Jobs gain `audio_asset_id` and `audio_token_hash`. The provider reads the link; no private Blob URL is exposed.

## Limits and safety
Speech counts against the same workspace entitlement check as generation. Speech requests: 40 per person per day (they are cheap, but not free). Audio uploads: 15 MB, WAV or MP3 by signature, not by filename. TTS output is validated as 16-bit mono PCM WAV before it is joined. Prompts and dialogue are sent to the provider (the form already says so). Nothing here is a dollar budget; real charges are reconciled with the provider as before.

## Not changed
Reservation, polling, saving, the never-resubmit rule, roles, the history list, private storage.
