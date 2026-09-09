"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import e from "./editorial.module.css";
import s from "./home-editorial.module.css";
const products = [
  {
    label: "Fund OS",
    title: "Keep the fund in view.",
    description:
      "Connect investments, valuations, capital calls, distributions, and LP reporting in one operating environment.",
    href: "/products/fund-os",
    stages: [
      "Record investments",
      "Track performance",
      "Manage capital",
      "Report to LPs",
    ],
  },
  {
    label: "Deal Flow",
    title: "From first look to investment decision.",
    description:
      "Bring sourcing, deal evaluation, investment committee materials, and ownership into a shared pipeline.",
    href: "/products/deal-flow",
    stages: [
      "Source opportunities",
      "Evaluate fit",
      "Prepare the IC",
      "Track decisions",
    ],
  },
  {
    label: "Cap Table",
    title: "Understand the next round before it happens.",
    description:
      "Model ownership, SAFEs, dilution, and financing scenarios alongside the rest of your fundraising work.",
    href: "/products/cap-table",
    stages: [
      "Record ownership",
      "Model financing",
      "Compare dilution",
      "Plan the next round",
    ],
  },
  {
    label: "Outreach",
    title: "Give every conversation its context.",
    description:
      "Prepare personalized outreach, manage campaigns, and keep investor relationships connected to the raise.",
    href: "/products/outreach",
    stages: [
      "Build a shortlist",
      "Prepare outreach",
      "Manage replies",
      "Follow through",
    ],
  },
];
export function EditorialPlatform() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const product = products[active];
  return (
    <section
      className={`${e.section} ${e.dark}`}
      id="platform"
      aria-labelledby="platform-heading"
    >
      <div className={e.container}>
        <span className={e.eyebrow}>The Anker platform</span>
        <h2 id="platform-heading">
          One system. A connected
          <br />
          capital lifecycle.
        </h2>
        <div
          className={s.tabs}
          role="tablist"
          aria-label="Explore platform capabilities"
        >
          {products.map((item, i) => (
            <button
              key={item.label}
              id={`platform-tab-${i}`}
              role="tab"
              aria-selected={i === active}
              aria-controls={`platform-panel-${i}`}
              tabIndex={i === active ? 0 : -1}
              ref={(node) => {
                refs.current[i] = node;
              }}
              onClick={() => setActive(i)}
              onKeyDown={(event) => {
                let next = i;
                if (event.key === "ArrowRight")
                  next = (i + 1) % products.length;
                else if (event.key === "ArrowLeft")
                  next = (i + products.length - 1) % products.length;
                else if (event.key === "Home") next = 0;
                else if (event.key === "End") next = products.length - 1;
                else return;
                event.preventDefault();
                setActive(next);
                refs.current[next]?.focus();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        {products.map((item, i) => (
          <div
            key={item.label}
            hidden={i !== active}
            id={`platform-panel-${i}`}
            role="tabpanel"
            aria-labelledby={`platform-tab-${i}`}
            tabIndex={0}
          >
            {i === active && (
              <div className={s.platformPanel}>
                <div>
                  <h3>{product.title}</h3>
                  <p>{product.description}</p>
                  <Link href={product.href} className={e.textLink}>
                    Explore {product.label}
                    <ArrowRight size={18} aria-hidden="true" />
                  </Link>
                </div>
                <ol
                  className={s.workflow}
                  aria-label={`${product.label} workflow`}
                >
                  {product.stages.map((stage, index) => (
                    <li key={stage}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <strong>{stage}</strong>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
