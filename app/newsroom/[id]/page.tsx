import Link from "next/link";
import { ArrowLeft, Calendar, User, Tag } from "lucide-react";
import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";
import { getArticleById, getPublishedArticles } from "@/lib/db/queries";
import { notFound } from "next/navigation";

// Always render at request time — depends on a live DB.
export const dynamic = "force-dynamic";

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    month: 'long', 
    day: 'numeric',
    year: 'numeric' 
  });
}

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = await getArticleById(id);

  if (!article) {
    notFound();
  }

  // Get related articles
  const allArticles = await getPublishedArticles(4);
  const relatedArticles = allArticles.filter(a => a.id !== id).slice(0, 3);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navigation />

      {/* Article Header */}
      <section className="pt-32 pb-12 lg:pt-40 lg:pb-16">
        <div className="max-w-4xl mx-auto px-6 lg:px-12">
          <Link 
            href="/newsroom"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Newsroom
          </Link>

          <div className="flex items-center gap-4 mb-6">
            <span className="font-mono text-xs text-muted-foreground uppercase px-3 py-1 bg-foreground/5">
              {article.blog_type}
            </span>
          </div>

          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl tracking-tight mb-6">
            {article.headline}
          </h1>

          {article.subheadline && (
            <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
              {article.subheadline}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-6 py-6 border-t border-b border-foreground/10">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="w-4 h-4" />
              <span>{article.author}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span>{formatDate(article.published_at)}</span>
            </div>
            {article.tags && article.tags.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Tag className="w-4 h-4" />
                <span>{article.tags.join(', ')}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Article Content */}
      <section className="pb-16 lg:pb-24">
        <div className="max-w-4xl mx-auto px-6 lg:px-12">
          {article.image_url && (
            <div className="mb-12">
              <img 
                src={article.image_url} 
                alt={article.headline}
                className="w-full h-auto object-cover"
              />
            </div>
          )}

          <div className="prose prose-lg max-w-none">
            {article.content ? (
              <div 
                className="text-foreground/80 leading-relaxed space-y-6"
                dangerouslySetInnerHTML={{ __html: article.content }}
              />
            ) : (
              <p className="text-muted-foreground italic">
                Full article content coming soon.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Related Articles */}
      {relatedArticles.length > 0 && (
        <section className="py-16 lg:py-24 border-t border-foreground/10">
          <div className="max-w-7xl mx-auto px-6 lg:px-12">
            <h2 className="font-display text-3xl mb-12">More articles</h2>
            <div className="grid md:grid-cols-3 gap-8">
              {relatedArticles.map((related) => (
                <Link
                  key={related.id}
                  href={`/newsroom/${related.id}`}
                  className="group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span className="font-mono text-xs text-muted-foreground uppercase">
                      {related.blog_type}
                    </span>
                    <span className="w-1 h-1 rounded-full bg-foreground/30" />
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatDate(related.published_at)}
                    </span>
                  </div>
                  <h3 className="font-display text-xl text-foreground group-hover:translate-x-2 transition-transform duration-300">
                    {related.headline}
                  </h3>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <FooterSection />
    </main>
  );
}
