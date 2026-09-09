# Authentication and editorial imagery refresh

## Design

All six authentication screens now share a compact form, silver Anker logo, light/deep-blue themes, and a static architectural illustration. The form leads on mobile; the secondary editorial panel is hidden below 900px. Labels, password-manager hints, password visibility controls, keyboard focus outlines, error announcements and busy states are consistent. The illustration has no animation, and reduced-motion preferences suppress loading motion.

Login preserves safe internal return destinations, including the /login alias. Recovery passes through /auth/callback to exchange the recovery code before opening the reset form. Registration remains invitation-only and preserves server validation. Its role selector exposes the existing founder/investor choice. The success screen no longer promises a confirmation email from an endpoint that preconfirms accounts.

## Image assignments

Each changed hero gets its own locally served 1536×1024 WebP. The 11 new images total approximately 1.9 MiB, with individual files between 106 and 288 KiB. They are illustrative generated artwork, not photographs of actual Anker staff, premises, portfolio businesses or investments. Decorative empty alt text avoids presenting conceptual artwork as factual content. Existing homepage, About and investor-database imagery is retained.

| Page | Asset |
| --- | --- |
| /solutions/founders | public/editorial/founders.webp |
| /solutions/vcs | public/editorial/investment-team.webp |
| /solutions/lps | public/editorial/long-horizon.webp |
| /products/discover | public/editorial/discovery.webp |
| /products/outreach | public/editorial/relationships.webp |
| /products/fund-os | public/editorial/fund-operations.webp |
| /products/deal-flow | public/editorial/deal-flow.webp |
| /products/cap-table | public/editorial/ownership.webp |
| /careers | public/editorial/careers-studio.webp |
| /pitch-deck-templates | public/editorial/presentation.webp |
| /vision | public/editorial/future-energy.webp |

## Validation

- TypeScript check passed.
- All 111 tests passed, including login failure/retry, duplicate-submit prevention, password visibility, recovery response handling, reset validation, invitation state and role preservation, and unsafe return URLs.
- All generated assets visually inspected; production WebP files verified during encoding.
- Production HTTP smoke check passed for all 17 updated auth and marketing pages; `/login` preserved its internal return destination.
- Browser viewport/focus verification remains uncompleted: Chromium is absent and its download timed out in this environment. Desktop and mobile layout should be checked on the branch preview.
- Production build passed, including all 175 static pages, with `NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1 pnpm build`. The environment required system certificates to fetch the existing Google Fonts; no build configuration was changed.
- No database migrations are required. A real recovery email round trip should be checked in the configured Supabase environment, with the existing /auth/callback URL included in the redirect allowlist.

## Generation prompts

The founder image used an editorial scene of four startup founders in a Berlin clean-energy engineering studio examining a prototype, with a deep-blue/silver palette, candid illustrative subjects, and no logos or readable text. This is a prompt summary; the exact full prompt was not retained.

### investment-team

Use case: photorealistic-natural. Landscape 1536x1024 website artwork for Anker, a venture operating system. Candid editorial photograph of three diverse venture investors reviewing a portfolio across a long oak meeting table in a quiet contemporary office, papers without legible text, attentive thoughtful gestures, afternoon side light, navy clothing and silver architecture. They are illustrative subjects, not Anker staff. Sophisticated institutional editorial look, tactile physical detail and calm natural light. Deep blue, silver, chalk palette. Central focal point for responsive crops. No logos, watermarks, text, collage, neon or UI. One complete image.

### long-horizon

Use case: photorealistic-natural. Asset: landscape 1536x1024 website editorial photograph for Anker, a venture operating system. Photorealistic wide view across quiet coastal hills toward a distant sea horizon, foreground pale grasses, layered marine-blue headlands in mist, dawn silver light reflected on the ocean. Long-term stewardship and patient capital for limited partners. Calm considered natural landscape, no buildings or text. Refined institutional editorial direction. Palette limited to deep marine blue, silver, chalk and restrained natural tones. Rich tactile detail, deliberate composition with the focal subject centrally framed for responsive crops. No text, logos, watermarks, UI, collage, neon or artificial glowing networks. One complete image.

### discovery

Use case: photorealistic-natural. Asset: landscape 1536x1024 website editorial photograph for Anker, a venture operating system. High oblique aerial photograph of a coastal European city at blue hour, distinct illuminated blocks and interconnecting boulevards, waterfront in the distance. Discovery, finding meaningful patterns in a broad investment landscape. Photorealistic editorial aerial photography, no sci-fi overlay. Refined institutional editorial direction. Palette limited to deep marine blue, silver, chalk and restrained natural tones. Rich tactile detail, deliberate composition with the focal subject centrally framed for responsive crops. No text, logos, watermarks, UI, collage, neon or artificial glowing networks. One complete image.

### relationships

Use case: photorealistic-natural. Asset: landscape 1536x1024 website editorial photograph for Anker, a venture operating system. Wide photograph of an elegant pedestrian suspension bridge crossing a calm river, delicate silver cables converge at a distant anchorage, dawn marine-blue water, soft white sky. Human relationships and connecting capital. Architectural editorial photography, no city skyline cliche, no people close up. Refined institutional editorial direction. Palette limited to deep marine blue, silver, chalk and restrained natural tones. Rich tactile detail, deliberate composition with the focal subject centrally framed for responsive crops. No text, logos, watermarks, UI, collage, neon or artificial glowing networks. One complete image.

### fund-operations

Use case: photorealistic-natural. Asset: landscape 1536x1024 website editorial photograph for Anker, a venture operating system. An intricate brushed silver mechanical assembly of precision circular gears and linked shafts, still-life macro photography, navy blue studio backdrop, side lighting reveals machining detail. Metaphor for coordinated venture fund operations. Sculptural refined engineering, not a chart or UI. Refined institutional editorial direction. Palette limited to deep marine blue, silver, chalk and restrained natural tones. Rich tactile detail, deliberate composition with the focal subject centrally framed for responsive crops. No text, logos, watermarks, UI, collage, neon or artificial glowing networks. One complete image.

### deal-flow

Use case: photorealistic-natural. Landscape 1536x1024 website artwork for Anker, a venture operating system. Sculptural branching channels cut into a solid silver-grey stone surface, viewed from an elevated angle, several paths converge into one precise open channel extending toward the upper edge, subtle water reflections, architectural abstraction of evaluating and progressing opportunities. No literal arrows, charts or writing. Sophisticated institutional editorial look, tactile physical detail and calm natural light. Deep blue, silver, chalk palette. Central focal point for responsive crops. No logos, watermarks, text, collage, neon or UI. One complete image.

### ownership

Use case: stylized-concept. Asset: landscape 1536x1024 website editorial photograph for Anker, a venture operating system. Museum-quality sculptural still life of overlapping translucent blue glass discs and brushed silver circular segments balanced on a pale limestone plinth. Ownership and shared participation, abstract conceptual editorial photography, subtle refractions, real physical materials, no pie-chart labels, no numbers, no arrows. Refined institutional editorial direction. Palette limited to deep marine blue, silver, chalk and restrained natural tones. Rich tactile detail, deliberate composition with the focal subject centrally framed for responsive crops. No text, logos, watermarks, UI, collage, neon or artificial glowing networks. One complete image.

### careers-studio

Use case: photorealistic-natural. Landscape 1536x1024 website artwork for Anker, a venture operating system. A bright empty creative engineering workspace, modular desks, unbranded closed laptops, carefully arranged materials, a single plant, large windows casting silver morning light across pale wood and deep-blue accents. Welcoming lived-in environment with room to build. Architectural editorial photograph, no people. Sophisticated institutional editorial look, tactile physical detail and calm natural light. Deep blue, silver, chalk palette. Central focal point for responsive crops. No logos, watermarks, text, collage, neon or UI. One complete image.

### presentation

Use case: photorealistic-natural. Landscape 1536x1024 website artwork for Anker, a venture operating system. Still life of a fan of blank matte paper sheets, a bound navy presentation folio, brushed aluminium ruler, on a pale stone table. Strong diagonal natural light, carefully considered editorial graphic composition suggesting preparing a clear investment story. Paper completely blank, no words or diagrams. Sophisticated institutional editorial look, tactile physical detail and calm natural light. Deep blue, silver, chalk palette. Central focal point for responsive crops. No logos, watermarks, text, collage, neon or UI. One complete image.

### future-energy

Use case: photorealistic-natural. Landscape 1536x1024 website artwork for Anker, a venture operating system. Photorealistic aerial editorial photograph of an offshore wind farm on a vast deep marine-blue sea, elegant white turbines receding to a pale silver horizon, soft morning mist, clean understated climate technology vision, realistic scale. No artificial networks or text. Sophisticated institutional editorial look, tactile physical detail and calm natural light. Deep blue, silver, chalk palette. Central focal point for responsive crops. No logos, watermarks, text, collage, neon or UI. One complete image.
