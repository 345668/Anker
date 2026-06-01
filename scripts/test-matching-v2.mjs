// Quick sanity test for v2 scoring math.
// Run: node scripts/test-matching-v2.mjs
//
// We can't easily import the TS modules without ts-node, so this test
// exercises the SAME absolute-points model in a parallel JS implementation
// and verifies the boundary cases hit the documented thresholds.

const cases = [
  {
    name: "SVS-style local Utah anchor FoF with sweet-spot fit",
    factors: { lpType: 28, aum: 25, sector: 20, geo: 22, thesis: 18, contact: 5 },
    expected: 118,
    expectedTier: "champion",
  },
  {
    name: "Mid-size US asset manager, 1 sector overlap",
    factors: { lpType: 15, aum: 10, sector: 8, geo: 10, thesis: 0, contact: 0 },
    expected: 43,
    expectedTier: "priority_b",
  },
  {
    name: "Large DACH family office, sector overlap, no email",
    factors: { lpType: 25, aum: 25, sector: 8, geo: 5, thesis: 0, contact: 0 },
    expected: 63,
    expectedTier: "priority_a",
  },
  {
    name: "HNW angel with 2 signals, US, sector match, email",
    factors: { lpType: 12, aum: 0, sector: 8, geo: 10, thesis: 0, contact: 5 },
    expected: 35,
    expectedTier: "prospect_c",
  },
  {
    name: "Below threshold (small, distant, no match)",
    factors: { lpType: 10, aum: 5, sector: 0, geo: 1, thesis: 0, contact: 0 },
    expected: 16,
    expectedTier: "prospect_c",
    belowMin: true,
  },
]

function tierFor(s) {
  if (s >= 80) return "champion"
  if (s >= 60) return "priority_a"
  if (s >= 40) return "priority_b"
  return "prospect_c"
}

let pass = 0, fail = 0
for (const c of cases) {
  const total = Object.values(c.factors).reduce((a, b) => a + b, 0)
  const tier = tierFor(total)
  const above = total >= 20
  const ok = total === c.expected && tier === c.expectedTier && (above === !c.belowMin)
  if (ok) {
    console.log(`✓ ${c.name}  →  ${total} (${tier})`)
    pass++
  } else {
    console.log(`✗ ${c.name}  →  expected ${c.expected}/${c.expectedTier} got ${total}/${tier}`)
    fail++
  }
}

console.log(`\n${pass}/${pass + fail} passed.`)
process.exit(fail === 0 ? 0 : 1)
