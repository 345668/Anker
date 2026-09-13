"use client";

import { useState } from "react";
import styles from "./article.module.css";

export function ArticleCover({
  src,
  title,
  category,
  hero = false,
}: {
  src?: string | null;
  title: string;
  category: string;
  hero?: boolean;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  if (hero && (!src || src === failedSource)) return null;
  return (
    <div className={hero ? styles.heroImage : styles.cover}>
      {src && src !== failedSource ? (
        <img
          src={src}
          alt={hero ? title : ""}
          loading={hero ? "eager" : "lazy"}
          decoding="async"
          onError={() => setFailedSource(src)}
        />
      ) : (
        <div className={styles.coverFallback} aria-hidden="true">
          <span>ANKER</span>
          <strong>{category}</strong>
          <span>Perspectives on private capital</span>
        </div>
      )}
    </div>
  );
}
