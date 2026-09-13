# Anker editorial website redesign

## Direction

An editorial website for the people building and backing companies. White and silver in light mode; deep navy and cool blue surfaces in dark mode. Generous reading space and original architectural imagery connect both themes. Anker remains an operating system for private capital; the design does not present it as McKinsey or imply an affiliation.

Reference structure: [McKinsey homepage](https://www.mckinsey.com/) and [McKinsey article](https://www.mckinsey.com/capabilities/tech-and-ai/our-insights/the-new-management-playbook-for-ai-how-to-move-faster-and-create-more-value). The article's title/date/byline/dek hierarchy and the homepage's editorial sequencing informed the implementation. No McKinsey text, logos, photographs, or proprietary fonts are included.

## Review in this order

| Page or group | Design and behavior |
| --- | --- |
| `/newsroom/[slug]` | Centered article masthead; author, date and reading time; publisher cover; narrow reading column; topic/region/sentiment rail; source PDF and citations; image-led related stories. Permanent legacy-ID redirects and article-specific metadata. Missing and unpublished articles return 404. |
| `/` | Bespoke split hero; direct paths for founders, funds and LPs; Anker's connected operating model; accessible product tabs; resources and contact. Replaces illustrative financial results and anonymous testimonials with workflow explanations. |
| `/products/discover` | Investor relevance and research context; discovery capabilities and progression into outreach. |
| `/products/fund-os` | Fund-wide visibility; investments, capital activity, performance and reporting. |
| `/products/deal-flow` | Decision context; shared sourcing-to-IC workflow. |
| `/products/cap-table` | Ownership decisions and financing scenarios. |
| `/products/outreach` | Investor context, drafting, campaign management and follow-through. |
| `/solutions/founders` | Image-led Founder Suite introduction and detailed fundraising workflows. |
| `/solutions/vcs` | Fund lifecycle introduction, operating responsibilities and existing deep-dive content. |
| `/solutions/lps` | Capital visibility, reporting access and LP-specific workflows. |
| `/about` | Connected-work thesis, principles and origin timeline. |
| `/vision` | Long-term ambition, pillars and beliefs; static, fully readable content replaces the automatic carousel. |
| `/team` | Founder profile with a typographic initials panel and existing LinkedIn destination. No invented headshot or staff. |
| `/careers` | Architecture-led introduction, values, role list and benefits. Existing roles and benefit terms retained; confirm their operational currency before release. |
| `/fundraising-guide` | Reading layout with section navigation and existing guide content. |
| `/pitch-deck-templates` | Stage-specific structures, slide narrative and sector guidance. Removes unsupported fundraising-result labels; template enquiries point to contact rather than claiming a download behind an invite-only registration page. |
| `/investor-database` | Research-led introduction, filter dimensions and shortlist workflow; no unverified coverage totals in the new presentation. |
| `/faq` | Native keyboard-accessible disclosures grouped by audience. Removes conflicting claims about Anker operating funds, check sizes and investment returns. |
| `/contact` | Focused contact introduction, existing submission action, properly associated field labels and announced feedback. Removes the dead video-tour CTA. |
| `/early-access` | Editorial introduction and form treatment, associated labels; preserves referral capture and request action. |
| `/apply`, `/apply/status/[ref]` | Theme-aware visual treatment, clearer spacing, associated labels/fieldsets, visible sector selection and keyboard focus. Existing API submission, terms, uploads and status lookup retained. |
| `/changelog` | Editorial masthead and quieter chronology; existing entries retained; removes dead RSS link. |
| `/security`, `/privacy`, `/terms` | Theme-aware reading typography. Security copy now describes source-verified controls and directs deployment-specific questions to the team; privacy and terms wording is retained. |
| `/newsroom` | Existing redesigned index retained, with both-theme consistency and accessible controls. |

Shared navigation uses click-controlled disclosures, Escape/focus restoration, a mobile menu, and the existing suite taxonomy. The footer preserves product/resource destinations and cookie preferences; empty social links are removed. Public surfaces now follow the saved theme or the system preference, with an explicit switch in the header. The existing silver mark appears in light mode and the red-and-silver brand mark in dark mode. See [the polish review](editorial-polish.md) for the follow-up comparison, content audit, and verification. Authenticated dashboards, account controls, database migrations, dependencies, and lockfiles are outside this redesign.

## Original image assets

Generated with the built-in image-generation tool; each is an original fictional architectural composition, not a photograph of an Anker office. No text, logos, people, charts or interface screenshots. Each source was 1536 × 1024 and was visually inspected, then encoded to WebP at quality 85. The three shipped files total about 356 KiB. Images use fixed dimensions, responsive sizes and deferred loading below the opening section.

| File | Meaning and use |
| --- | --- |
| `public/editorial/convergence.webp` | Founders, capital and intelligence coming together; homepage and fund/relationship/vision contexts. |
| `public/editorial/perspective.webp` | A clearer view of the investment landscape; research, discovery and LP contexts. |
| `public/editorial/building.webp` | Durable infrastructure and possibility; founder, company, careers and ownership contexts. |

### Final prompts

**Convergence**

Use case: stylized-concept. Asset type: premium venture capital operating-system website homepage hero, landscape 3:2. Primary request: "Convergence": sculptural brushed silver ribbons and structural spans elegantly converging toward a bright opening in a deep navy architectural space; a tangible visual metaphor for founders, capital, and intelligence joining. Style/medium: sophisticated editorial architectural photography of a physically plausible art installation; museum-grade art direction, premium consulting aesthetic. Composition/framing: wide 3:2 landscape, layered sculptural spans flowing with refined geometry towards a luminous distant opening; sufficient negative space and beautiful details suitable for large website crop. Lighting/mood: restrained natural daylight illuminating brushed metal against profound navy shadows, calm and assured. Color palette: deep navy, cool silver, white, a restrained hint of electric blue reflected light. Materials/textures: tangible fine brushed silver, crisp solid metallic edges, subtle reflections. Constraints: original fictional architecture, no literal anchor symbol, no logos, no text, no charts, no interfaces, no people, no watermark. Avoid: neon sci-fi, laser beams, glossy plastic, busy clutter, generic stock business metaphors.

**Perspective**

Use case: stylized-concept. Asset type: premium venture capital research and discovery website editorial image, landscape 3:2. Primary request: "Perspective": abstract editorial architectural photograph looking through layered silver and glass planes toward a distant blue horizon. Style/medium: sophisticated architectural photography of an original fictional space, premium consulting and magazine art direction. Composition/framing: wide 3:2 landscape, precise clean layered geometry with depth, framed vista of distant horizon, calm reflective planes; elegant off-center vanishing point. Lighting/mood: clear restrained daylight, serene spacious atmosphere. Color palette: white, cool silver, deep navy shadows, pale blue horizon with restrained electric blue accents from reflection only. Materials/textures: fine brushed silver, transparent architectural glass, calm subtle reflections, tangible surfaces. Constraints: no identifiable building, no logos, no text, no charts, no fake interfaces, no people, no watermark. Avoid: neon sci-fi, excessive glow, busy clutter, decorative patterns, cartoon rendering.

**Building for the long term**

Use case: stylized-concept. Asset type: premium venture capital company, vision and founder website editorial image, landscape 3:2. Primary request: "Building for the long term": soaring silver architectural framework against a clear pale blue sky, strong elegant diagonal perspective, expressing possibility and durable infrastructure. Style/medium: sophisticated photographic architectural editorial, realistic materials, original fictional structure, premium consulting aesthetic. Composition/framing: wide 3:2 landscape, upward-looking strong elegant diagonal perspective through a spacious silver framework, sculptural repeating beams, beautifully balanced open sky. Lighting/mood: crisp natural daylight, confident, enduring, spacious, optimistic. Color palette: cool silver, white, clear pale blue sky, restrained deep navy shadows. Materials/textures: precisely fabricated brushed silver metallic framework with subtle tangible grain and immaculate architectural connections. Constraints: no identifiable building or company, no logos, no text, no charts, no fake interfaces, no people, no watermark. Avoid: neon sci-fi, excessive glow, construction-site clutter, cranes, generic skyscraper skyline.

## Validation

- TypeScript typecheck passed independently of the build's configured typecheck bypass.
- Seventeen focused Vitest tests passed: existing newsroom search/filter/loading behavior, article draft protection and redirects, metadata and source links, menu keyboard behavior, product tabs, contact action submission and application labels/sector selection.
- Generated assets were inspected and their shipped dimensions and sizes checked.
- The normal production build was blocked by this environment's Google Fonts network restriction. The source font configuration is unchanged.
- An offline production compilation and prerender check passed using `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` with temporary local-only font CSS (174 static pages). This verifies compilation and prerendering, not the intended font rendering; the fixture is not committed or deployed.
- No live-database, real form submission, browser viewport, or end-to-end testing was performed. Review responsive rendering and real articles in the repository's deployment preview before merging.
