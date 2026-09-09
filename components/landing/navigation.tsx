"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ChevronDown, ArrowRight } from "lucide-react";
import { AnkerLogo } from "@/components/brand/anker-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { SIGNUP_CTA_VISIBLE } from "@/lib/auth/signups";
import { SUITES, SOLUTIONS } from "@/lib/nav/taxonomy";
import s from "./navigation.module.css";

const resources = [
  {
    name: "Newsroom",
    href: "/newsroom",
    desc: "Perspectives on private capital",
  },
  {
    name: "Fundraising guide",
    href: "/fundraising-guide",
    desc: "Prepare for your next raise",
  },
  {
    name: "Investor database",
    href: "/investor-database",
    desc: "Explore the investor landscape",
  },
  {
    name: "Pitch deck templates",
    href: "/pitch-deck-templates",
    desc: "Build a compelling investment case",
  },
  { name: "Changelog", href: "/changelog", desc: "Follow product development" },
  { name: "Pitch us", href: "/apply", desc: "Apply to raise with Anker" },
];
const company = [
  {
    name: "About Anker",
    href: "/about",
    desc: "One system for private capital",
  },
  {
    name: "Our vision",
    href: "/vision",
    desc: "The next interface for venture",
  },
  { name: "Our team", href: "/team", desc: "The people building Anker" },
  { name: "Careers", href: "/careers", desc: "Build with us" },
  {
    name: "Security",
    href: "/security",
    desc: "How we protect your information",
  },
  { name: "Contact", href: "/contact", desc: "Start a conversation" },
];
const menus = ["Platform", "Who we serve", "Insights & resources", "Company"];

export function Navigation() {
  const pathname = usePathname() || "/";
  const current = (href: string) =>
    pathname === href ? ("page" as const) : undefined;
  const inSection = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  const activeMenus = [
    SUITES.some((suite) => suite.items.some((item) => inSection(item.href))) &&
      pathname.startsWith("/products/"),
    SOLUTIONS.some((item) => inSection(item.href)),
    resources.some((item) => inSection(item.href)),
    company.some((item) => inSection(item.href)),
  ];
  const [open, setOpen] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const header = useRef<HTMLElement>(null);
  const mobileButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (!header.current?.contains(event.target as Node)) {
        setOpen(null);
        setMobile(false);
      }
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (open) {
        header.current
          ?.querySelector<HTMLButtonElement>(`[data-menu="${open}"]`)
          ?.focus();
        setOpen(null);
      } else if (mobile) {
        setMobile(false);
        mobileButton.current?.focus();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open, mobile]);
  useEffect(() => {
    if (mobile)
      header.current?.querySelector<HTMLButtonElement>("nav button")?.focus();
  }, [mobile]);
  function close() {
    setOpen(null);
    setMobile(false);
  }
  return (
    <header
      ref={header}
      className={`marketing-site ${s.header}`}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget as Node)
        )
          close();
      }}
    >
      <a
        href="#main-content"
        className={s.skip}
        onClick={(event) => {
          const main = document.getElementById("main-content");
          const target =
            main?.querySelector<HTMLElement>(
              ":scope > section, :scope > article, :scope > header",
            ) || main;
          if (target) {
            event.preventDefault();
            target.tabIndex = -1;
            target.focus();
            target.scrollIntoView({ block: "start" });
          }
        }}
      >
        Skip to content
      </a>
      <div className={s.announcement}>
        <span>Anker Plugins for Claude</span>
        <Link href="/newsroom/anker-plugins-for-claude" onClick={close}>
          Explore the announcement <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <div className={s.bar}>
        <Link href="/" aria-label="Anker home" onClick={close}>
          <AnkerLogo variant="default" className={s.logo} />
        </Link>
        <nav
          id="site-navigation"
          aria-label="Main navigation"
          className={`${s.navigation} ${mobile ? s.mobileOpen : ""}`}
        >
          {menus.map((menu, index) => (
            <div key={menu} className={s.menu}>
              <button
                data-menu={menu}
                data-current={activeMenus[index] || undefined}
                type="button"
                className={s.trigger}
                aria-expanded={open === menu}
                aria-controls={`site-menu-${index}`}
                onClick={() => setOpen(open === menu ? null : menu)}
              >
                {menu}
                <ChevronDown size={14} aria-hidden="true" />
              </button>
              <div
                id={`site-menu-${index}`}
                hidden={open !== menu}
                className={s.panel}
              >
                {menu === "Platform" ? (
                  <div className={s.suites}>
                    {SUITES.map((suite) => (
                      <section key={suite.key}>
                        <Link
                          href={suite.exploreHref}
                          aria-current={current(suite.exploreHref)}
                          onClick={close}
                          className={s.suiteTitle}
                        >
                          {suite.label}
                          <ArrowRight size={16} aria-hidden="true" />
                        </Link>
                        <p>{suite.tagline}</p>
                        <ul>
                          {suite.items.map((item) => (
                            <li key={item.name}>
                              <Link
                                href={item.href}
                                aria-current={current(item.href)}
                                onClick={close}
                              >
                                {item.name}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                ) : (
                  <ul className={s.linkGrid}>
                    {(menu === "Who we serve"
                      ? SOLUTIONS
                      : menu === "Company"
                        ? company
                        : resources
                    ).map((item) => (
                      <li key={item.name}>
                        <Link
                          href={item.href}
                          aria-current={current(item.href)}
                          onClick={close}
                        >
                          <strong>{item.name}</strong>
                          <span>{item.desc}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
          <div className={s.account}>
            <Link href="/login" onClick={close}>
              Sign in
            </Link>
            <Link
              className={s.contact}
              href={SIGNUP_CTA_VISIBLE ? "/register" : "/contact"}
              onClick={close}
            >
              {SIGNUP_CTA_VISIBLE ? "Get started" : "Talk to us"}
            </Link>
          </div>
        </nav>
        <div className={s.controls}>
          <ThemeToggle className={s.themeToggle} />
          <button
            ref={mobileButton}
            className={s.mobileToggle}
            type="button"
            aria-expanded={mobile}
            aria-controls="site-navigation"
            onClick={() => {
              setMobile(!mobile);
              setOpen(null);
            }}
          >
            {mobile ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            <span>{mobile ? "Close" : "Menu"}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
