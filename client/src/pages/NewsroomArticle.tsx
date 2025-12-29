import { motion } from "framer-motion";
import { Link, useParams } from "wouter";
import { ChevronLeft, Calendar, User, Tag, Sparkles, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import Secondary from '@/framer/secondary';
import Video from '@/framer/video';
import { Badge } from "@/components/ui/badge";

interface NewsArticle {
  id: string;
  slug: string;
  headline: string;
  executiveSummary: string;
  content: string;
  blogType: string;
  capitalType: string;
  capitalStage: string;
  geography: string;
  tags: string[];
  publishedAt: string;
  wordCount: number;
  isAIGenerated?: boolean;
}

const staticArticles: Record<string, {
  title: string;
  date: string;
  image: string;
  intro: string;
  blogType: string;
  author: string;
  content: string;
}> = {
  "demystifying-the-due-diligence-process": {
    title: "Demystifying the Due Diligence Process",
    date: "10.15.2025",
    image: "https://framerusercontent.com/images/gQaZdOSqiJjadiQIrHOio9VvgRE.jpg",
    intro: "Understanding due diligence can help startups prepare for VC funding.",
    blogType: "Insights",
    author: "James Reed",
    content: `Due diligence is a critical phase in the venture capital funding process. It's the period when VCs thoroughly examine every aspect of your startup before committing their investment.

**What VCs Look For:**

1. **Financial Health** - Your revenue, burn rate, runway, and financial projections are scrutinized in detail.

2. **Market Opportunity** - VCs assess the total addressable market (TAM) and your potential market share.

3. **Team Evaluation** - The founding team's experience, track record, and ability to execute are paramount.

4. **Technology & IP** - Your proprietary technology, patents, and technical moat are evaluated.

5. **Legal Compliance** - Corporate structure, contracts, and regulatory compliance are reviewed.

**How to Prepare:**

- Organize all financial documents and maintain clean books
- Document your technology stack and IP ownership
- Have customer references ready
- Prepare a detailed data room with all relevant materials
- Be transparent about challenges and how you're addressing them

The due diligence process typically takes 4-8 weeks. Being well-prepared can significantly accelerate this timeline and increase your chances of securing funding.`
  },
  "the-role-of-mentorship-in-startup-success": {
    title: "The Role of Mentorship in Startup Success",
    date: "10.02.2025",
    image: "https://framerusercontent.com/images/lnM36DSuw1wU4OZQ8b54pCYNLk.jpg",
    intro: "The right mentorship can be a game-changer for startups",
    blogType: "Guides",
    author: "Karen Wong",
    content: `Mentorship is often the differentiating factor between startups that succeed and those that fail. The right mentor can provide invaluable guidance, connections, and perspective.

**Benefits of Strong Mentorship:**

- **Experience Transfer** - Learn from someone who has navigated similar challenges
- **Network Access** - Tap into your mentor's professional network
- **Objective Feedback** - Get honest assessments of your strategy and execution
- **Emotional Support** - Entrepreneurship is lonely; mentors provide crucial support

**Finding the Right Mentor:**

1. Look for someone with relevant industry experience
2. Seek mentors who have built companies at your target scale
3. Find someone whose values align with yours
4. Ensure they have the time and willingness to engage

**Making the Most of Mentorship:**

- Come prepared to every meeting with specific questions
- Be open to feedback, even when it's difficult to hear
- Follow through on commitments and advice
- Update your mentor on progress and outcomes

The best mentor relationships are built on mutual respect and genuine interest in your success.`
  },
  "the-rise-of-deep-tech-what-vcs-need-to-know": {
    title: "The Rise of Deep Tech: What VCs Need to Know",
    date: "09.17.2025",
    image: "https://framerusercontent.com/images/bQuteiVt3GZjiqmoIL8qk2G23jw.jpg",
    intro: "Deep tech startups are disrupting industries – here's what VCs need to know.",
    blogType: "Trends",
    author: "Rachel Kim",
    content: `Deep tech refers to companies built on significant scientific or engineering advances. These startups are tackling some of the world's most complex problems.

**Key Deep Tech Sectors:**

- **Quantum Computing** - Revolutionary computational power for complex problems
- **Biotechnology** - Gene editing, synthetic biology, and personalized medicine
- **Advanced Materials** - New materials with unprecedented properties
- **Space Technology** - Commercial space exploration and satellite systems
- **AI/ML** - Cutting-edge artificial intelligence applications

**Investment Considerations:**

1. **Longer Development Cycles** - Deep tech often requires more time to reach market
2. **Higher Capital Requirements** - Research and development costs are significant
3. **Regulatory Complexity** - Many sectors face heavy regulatory oversight
4. **Technical Risk** - Scientific breakthroughs aren't guaranteed

**Why VCs Are Interested:**

- Massive market potential when technologies succeed
- Strong IP protection creates sustainable moats
- Government support and grants can reduce risk
- Strategic acquirers pay premium prices for proven technology

Deep tech investing requires patience and specialized expertise, but the potential returns can be extraordinary.`
  },
  "beyond-the-pitch-deck-what-founders-can-learn-from-vc-rejection": {
    title: "Beyond the Pitch Deck: What Founders Can Learn from VC Rejection",
    date: "09.04.2025",
    image: "https://framerusercontent.com/images/LyRf1qW7PqSbhWTppxDiMX17Q.jpg",
    intro: "Rejection can be a valuable learning experience for founders.",
    blogType: "Guides",
    author: "Michael Patel",
    content: `Every successful founder has faced rejection. The key is to learn from each "no" and use it to improve your approach.

**Common Reasons for Rejection:**

- **Market Size** - VCs may not see a large enough opportunity
- **Team Gaps** - Missing key skills or experience on the founding team
- **Traction** - Insufficient proof of concept or early customer validation
- **Competition** - Too many players or a dominant incumbent
- **Timing** - The market may not be ready for your solution

**How to Handle Rejection:**

1. **Ask for Feedback** - Many VCs will share their reasoning if asked politely
2. **Don't Take It Personally** - VCs pass on great companies all the time
3. **Identify Patterns** - If you hear the same objection repeatedly, address it
4. **Iterate Your Pitch** - Use feedback to refine your story and materials

**Turning Rejection Into Opportunity:**

- Build relationships even with VCs who pass
- Use the feedback loop to strengthen your business
- Consider whether the rejection reveals real issues to address
- Remember that fit matters - not every VC is right for every company

The most successful founders view rejection as data that helps them improve.`
  },
  "the-future-of-venture-capital-trends-to-watch": {
    title: "The Future of Venture Capital: Trends to Watch",
    date: "08.17.2025",
    image: "https://framerusercontent.com/images/ypwAK3tqkKBOjg9Rrj0y2fgLww.jpg",
    intro: "The venture capital landscape is shifting – here are the trends to watch",
    blogType: "Insights",
    author: "Christopher Martin",
    content: `The venture capital industry is evolving rapidly. Understanding these trends can help founders and investors navigate the changing landscape.

**Key Trends Shaping VC:**

1. **Geographic Diversification** - More investment flowing to emerging tech hubs
2. **Sector Specialization** - VCs increasingly focus on specific industries
3. **Founder-Friendly Terms** - Competition for deals is driving better terms
4. **ESG Integration** - Environmental and social factors gaining importance
5. **AI-Powered Due Diligence** - Technology transforming the investment process

**The Rise of Alternative Funding:**

- Revenue-based financing gaining traction
- Crowdfunding platforms maturing
- Corporate venture arms becoming more active
- Secondary markets providing liquidity options

**What This Means for Founders:**

- More options for funding beyond traditional VC
- Greater importance of choosing the right partners
- Need to understand different investor motivations
- Opportunity to negotiate from a position of strength

The future of VC will be more diverse, specialized, and founder-centric than ever before.`
  },
  "from-zero-to-hero-building-a-strong-brand-identity": {
    title: "From Zero to Hero: Building a Strong Brand Identity",
    date: "08.10.2025",
    image: "https://framerusercontent.com/images/q9Acoy8yOLHQUhv8tLaucw2E6uo.jpg",
    intro: "A strong brand identity can make all the difference for startups",
    blogType: "Guides",
    author: "Sophia Rodriguez",
    content: `Brand identity is more than just a logo. It's how your company presents itself to the world and the emotional connection you build with customers.

**Elements of Strong Brand Identity:**

- **Visual Identity** - Logo, colors, typography, and design language
- **Voice and Tone** - How you communicate across all channels
- **Values and Mission** - What you stand for and why you exist
- **Customer Experience** - Every touchpoint reflects your brand

**Building Your Brand:**

1. **Define Your Purpose** - Why does your company exist beyond making money?
2. **Know Your Audience** - Deeply understand who you're serving
3. **Differentiate** - What makes you unique in the market?
4. **Be Consistent** - Apply your brand consistently across all channels
5. **Evolve Thoughtfully** - Brands should grow but maintain core identity

**Common Mistakes to Avoid:**

- Copying competitors instead of finding your own voice
- Changing brand elements too frequently
- Inconsistent application across channels
- Focusing only on visual elements while neglecting voice

A strong brand creates trust, recognition, and loyalty that compounds over time.`
  },
  "the-art-of-negotiation-tips-for-founders": {
    title: "The Art of Negotiation: Tips for Founders",
    date: "07.28.2025",
    image: "https://framerusercontent.com/images/Rf6AGJdqHXAyTMdqgeIEMydTW4.jpg",
    intro: "Founders can secure better terms with the right negotiation strategies",
    blogType: "Trends",
    author: "Daniel Taylor",
    content: `Negotiation is a critical skill for founders. Whether you're closing funding, hiring talent, or signing customers, your ability to negotiate impacts your success.

**Key Negotiation Principles:**

1. **Know Your BATNA** - Best Alternative To Negotiated Agreement gives you leverage
2. **Understand Their Interests** - What does the other side really want?
3. **Create Value** - Look for win-win opportunities
4. **Be Prepared to Walk Away** - Desperation kills negotiations
5. **Document Everything** - Get agreements in writing

**Negotiating with VCs:**

- Research the VC's typical terms and portfolio
- Know your company's worth with comparable data
- Focus on the most important terms, not every detail
- Build relationships before you need to negotiate
- Have alternatives to strengthen your position

**Common Mistakes:**

- Negotiating against yourself by making concessions unprompted
- Focusing only on valuation while ignoring other terms
- Being adversarial when you should be collaborative
- Not understanding the implications of terms you're agreeing to

The best negotiations end with both parties feeling good about the outcome.`
  },
  "why-vcs-are-betting-big-on-sustainability-startups": {
    title: "Why VCs Are Betting Big on Sustainability Startups",
    date: "07.28.2025",
    image: "https://framerusercontent.com/images/oDy7ZLeygr8lT7MWMGaWW5AL4.jpg",
    intro: "Sustainability startups are becoming increasingly attractive to VCs",
    blogType: "Insights",
    author: "Michael Patel",
    content: `Sustainability is no longer a niche investment category. It's becoming central to VC investment strategies worldwide.

**Why Sustainability Matters:**

- **Market Size** - Climate tech alone is a multi-trillion dollar opportunity
- **Policy Tailwinds** - Government incentives driving adoption
- **Consumer Demand** - Growing preference for sustainable products
- **Corporate Commitments** - Net-zero pledges creating B2B demand

**Hot Sustainability Sectors:**

1. **Clean Energy** - Solar, wind, and energy storage technologies
2. **Electric Mobility** - EVs, charging infrastructure, and fleet management
3. **Sustainable Agriculture** - Alternative proteins, precision farming
4. **Circular Economy** - Recycling, waste reduction, and sharing economy
5. **Carbon Markets** - Carbon capture, offsets, and measurement

**Investment Considerations:**

- Longer time horizons for some technologies
- Regulatory risk and opportunity
- Technical complexity requires specialized expertise
- Impact measurement increasingly important

**The Opportunity for Founders:**

- Abundant capital available for sustainability solutions
- Strong talent pool motivated by mission
- Potential for government grants and subsidies
- Growing ecosystem of corporate partners and customers

The convergence of financial returns and positive impact is creating a new wave of sustainable startups.`
  }
};

const Navigation = () => {
  const navLinks = [
    { label: "Portfolio", href: "/portfolio" },
    { label: "Vision", href: "/vision" },
    { label: "Team", href: "/team" },
    { label: "Newsroom", href: "/newsroom" },
    { label: "FAQ", href: "/faq" },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 px-6 py-4 bg-[rgb(18,18,18)]/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link href="/" className="text-white text-xl font-light tracking-wider">
          Anker<sup className="text-xs">®</sup>
        </Link>
        
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link 
              key={link.href} 
              href={link.href}
              className={`text-sm font-light transition-colors ${link.href === '/newsroom' ? 'text-white' : 'text-white/70 hover:text-white'}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        
        <Secondary 
          text="Contact" 
          link="/contact"
          style={{ transform: 'scale(0.9)' }}
        />
      </div>
    </header>
  );
};

export default function NewsroomArticle() {
  const { slug } = useParams<{ slug: string }>();

  const { data: aiArticle, isLoading } = useQuery<NewsArticle>({
    queryKey: ['/api/newsroom/articles', slug],
    enabled: !!slug && !staticArticles[slug || ''],
  });

  const staticArticle = slug ? staticArticles[slug] : null;
  
  const article = staticArticle ? {
    title: staticArticle.title,
    date: staticArticle.date,
    image: staticArticle.image,
    intro: staticArticle.intro,
    blogType: staticArticle.blogType,
    author: staticArticle.author,
    content: staticArticle.content,
    isAIGenerated: false,
  } : aiArticle ? {
    title: aiArticle.headline,
    date: aiArticle.publishedAt ? new Date(aiArticle.publishedAt).toLocaleDateString() : new Date().toLocaleDateString(),
    image: "https://framerusercontent.com/images/gQaZdOSqiJjadiQIrHOio9VvgRE.jpg",
    intro: aiArticle.executiveSummary?.split('\n')[0] || "",
    blogType: aiArticle.blogType || "Insights",
    author: "AI Newsroom",
    content: aiArticle.content,
    isAIGenerated: true,
    capitalType: aiArticle.capitalType,
    geography: aiArticle.geography,
    tags: aiArticle.tags,
  } : null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white/50 animate-spin" />
      </div>
    );
  }

  if (!article) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="min-h-screen bg-[rgb(18,18,18)]"
      >
        <Navigation />
        <div className="pt-32 px-6 max-w-4xl mx-auto text-center">
          <h1 className="text-4xl font-light text-white mb-4">Article Not Found</h1>
          <p className="text-white/60 mb-8">The article you're looking for doesn't exist.</p>
          <Link 
            href="/newsroom"
            className="inline-flex items-center text-[rgb(142,132,247)] hover:underline"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Newsroom
          </Link>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-[rgb(18,18,18)]"
    >
      <Navigation />
      
      <section className="relative h-[50vh] min-h-[350px] flex items-end overflow-hidden">
        <div className="absolute inset-0 w-full h-full">
          <img 
            src={article.image} 
            alt={article.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[rgb(18,18,18)] via-[rgb(18,18,18)]/60 to-transparent" />
        </div>
        <div className="relative z-10 w-full max-w-4xl mx-auto px-6 pb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center gap-3 mb-4">
              <Badge variant="outline" className="border-white/30 text-white/80">
                {article.blogType}
              </Badge>
              {article.isAIGenerated && (
                <Badge className="bg-[rgb(142,132,247)] text-white border-none gap-1">
                  <Sparkles className="w-3 h-3" />
                  AI Generated
                </Badge>
              )}
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-light text-white mb-6" data-testid="text-article-title">
              {article.title}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-white/60 text-sm">
              <span className="flex items-center gap-2">
                <User className="w-4 h-4" />
                {article.author}
              </span>
              <span className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {article.date}
              </span>
            </div>
          </motion.div>
        </div>
      </section>

      <article className="max-w-4xl mx-auto px-6 py-16">
        <Link 
          href="/newsroom" 
          className="inline-flex items-center text-white/50 hover:text-white transition-colors text-sm mb-8"
          data-testid="link-back-newsroom"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Newsroom
        </Link>

        {article.intro && (
          <p className="text-xl text-white/80 font-light mb-8 leading-relaxed border-l-2 border-[rgb(142,132,247)] pl-6">
            {article.intro}
          </p>
        )}

        <div 
          className="prose prose-invert prose-lg max-w-none"
          style={{
            '--tw-prose-body': 'rgba(255,255,255,0.7)',
            '--tw-prose-headings': 'rgba(255,255,255,0.9)',
            '--tw-prose-links': 'rgb(142,132,247)',
            '--tw-prose-bold': 'rgba(255,255,255,0.9)',
          } as React.CSSProperties}
          data-testid="article-content"
        >
          {article.content.split('\n\n').map((paragraph, idx) => {
            if (paragraph.startsWith('**') && paragraph.endsWith('**')) {
              return (
                <h2 key={idx} className="text-2xl font-medium text-white mt-8 mb-4">
                  {paragraph.replace(/\*\*/g, '')}
                </h2>
              );
            }
            if (paragraph.startsWith('- ') || paragraph.startsWith('1. ')) {
              const items = paragraph.split('\n').filter(line => line.trim());
              const isOrdered = paragraph.startsWith('1. ');
              const ListTag = isOrdered ? 'ol' : 'ul';
              return (
                <ListTag key={idx} className={`${isOrdered ? 'list-decimal' : 'list-disc'} pl-6 my-4 space-y-2`}>
                  {items.map((item, i) => (
                    <li key={i} className="text-white/70">
                      {item.replace(/^[-\d.]\s*/, '').replace(/\*\*/g, '')}
                    </li>
                  ))}
                </ListTag>
              );
            }
            return (
              <p key={idx} className="text-white/70 leading-relaxed mb-4">
                {paragraph.split('**').map((part, i) => 
                  i % 2 === 1 ? <strong key={i} className="text-white/90">{part}</strong> : part
                )}
              </p>
            );
          })}
        </div>

        {'tags' in article && article.tags && article.tags.length > 0 && (
          <div className="mt-12 pt-8 border-t border-white/10">
            <div className="flex items-center gap-2 flex-wrap">
              <Tag className="w-4 h-4 text-white/40" />
              {article.tags.map((tag: string, idx: number) => (
                <Badge key={idx} variant="outline" className="border-white/20 text-white/60">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </article>
    </motion.div>
  );
}
