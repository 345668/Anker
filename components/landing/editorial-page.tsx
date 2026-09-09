import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import e from "./editorial.module.css";

export function EditorialHero({
  eyebrow,
  title,
  description,
  image,
  action,
  secondary,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  image?: "building" | "perspective" | "convergence";
  action?: { label: string; href: string };
  secondary?: { label: string; href: string };
}) {
  return (
    <section className={image ? e.splitHero : e.hero}>
      <div className={image ? e.splitHeroCopy : e.container}>
        <span className={e.eyebrow}>{eyebrow}</span>
        <h1>{title}</h1>
        {description && <p className={e.lede}>{description}</p>}
        {(action || secondary) && (
          <div className={e.actions}>
            {action && (
              <Link href={action.href} className={e.button}>
                {action.label}
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            )}
            {secondary && (
              <Link href={secondary.href} className={e.textLink}>
                {secondary.label}
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            )}
          </div>
        )}
      </div>
      {image && (
        <Image
          src={`/editorial/${image}.webp`}
          alt=""
          width={1536}
          height={1024}
          priority
          sizes="(max-width:767px) 100vw, 50vw"
          data-art={image}
          className={e.splitHeroImage}
        />
      )}
    </section>
  );
}
export function EditorialCta({
  title = "Let’s build what comes next.",
  label = "Talk to us",
  href = "/contact",
}: {
  title?: string;
  label?: string;
  href?: string;
}) {
  return (
    <section className={e.cta}>
      <div className={e.container}>
        <h2>{title}</h2>
        <Link href={href} className={e.button}>
          {label}
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
