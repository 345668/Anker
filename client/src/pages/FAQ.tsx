import { motion } from "framer-motion";
import { Link } from "wouter";
import { ChevronLeft, ChevronDown } from "lucide-react";
import { useState } from "react";

import Secondary from '@/framer/secondary';
import Video from '@/framer/video';

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
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <Link href="/" className="text-white text-xl font-light tracking-wider" data-testid="link-logo">
          Anker<sup className="text-xs">®</sup>
        </Link>
        
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link 
              key={link.href} 
              href={link.href}
              className={`text-sm font-light transition-colors ${link.href === '/faq' ? 'text-white' : 'text-white/70 hover:text-white'}`}
              data-testid={`link-nav-${link.label.toLowerCase()}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        
        <Secondary 
          text="Contact" 
          link="/contact"
          style={{ transform: 'scale(0.9)' }}
          data-testid="button-nav-contact"
        />
      </div>
    </header>
  );
};

const faqCategories = [
  {
    title: "Investment Process",
    items: [
      {
        question: "What stage companies do you invest in?",
        answer: "We primarily focus on Seed and Series A rounds, but we are flexible for exceptional founders with compelling visions. Our typical check size ranges from $500K to $5M."
      },
      {
        question: "Do you lead rounds?",
        answer: "Yes, we are comfortable leading rounds and taking board seats to actively support our portfolio companies. We believe in being hands-on partners, not passive investors."
      },
      {
        question: "How long does your investment process take?",
        answer: "Our typical timeline from first meeting to term sheet is 2-4 weeks. We pride ourselves on moving quickly for exceptional opportunities while maintaining thorough due diligence."
      },
      {
        question: "What does your due diligence process look like?",
        answer: "We conduct comprehensive due diligence including market analysis, competitive landscape assessment, technical evaluation, and extensive founder references. We're transparent about our process and timeline throughout."
      },
    ]
  },
  {
    title: "Investment Focus",
    items: [
      {
        question: "What sectors do you focus on?",
        answer: "We invest across four key sectors: Crypto & Blockchain, Technology, Healthcare, and Finance. Within these sectors, we look for companies leveraging innovative technology to solve significant problems."
      },
      {
        question: "Do you invest globally?",
        answer: "While we're headquartered in San Francisco, we invest globally. We have portfolio companies across North America, Europe, and Asia, and we're always looking for the best founders regardless of geography."
      },
      {
        question: "What makes a company stand out to you?",
        answer: "We look for exceptional founders with deep domain expertise, large addressable markets, differentiated technology or business models, and a clear path to building a durable competitive advantage."
      },
    ]
  },
  {
    title: "Portfolio Support",
    items: [
      {
        question: "How do you support portfolio companies?",
        answer: "We provide hands-on support including strategic guidance, introductions to customers and partners, help with recruiting key hires, and assistance with follow-on fundraising. Our network of 50+ portfolio companies also provides valuable peer learning opportunities."
      },
      {
        question: "Do you participate in follow-on rounds?",
        answer: "Yes, we actively reserve capital for follow-on investments in our best-performing companies. Our 95% follow-on investment rate reflects our commitment to supporting winners through multiple stages of growth."
      },
      {
        question: "Can you make introductions to other investors?",
        answer: "Absolutely. We have strong relationships with top-tier VCs at all stages and regularly help our portfolio companies with fundraising introductions, syndicate building, and investor strategy."
      },
    ]
  },
  {
    title: "Getting in Touch",
    items: [
      {
        question: "How can I submit my pitch deck?",
        answer: "You can reach out through our contact form or email us directly at hello@anker.vc. We review every submission and respond within one week."
      },
      {
        question: "Do you accept cold outreach?",
        answer: "Yes, we welcome cold outreach and have invested in several companies that came to us without a warm introduction. We believe the best founders can come from anywhere."
      },
      {
        question: "What should I include in my initial outreach?",
        answer: "Include a brief overview of your company, the problem you're solving, your traction to date, and what you're raising. A deck is helpful but not required for the initial conversation."
      },
    ]
  },
];

function AccordionItem({ question, answer, isOpen, onClick, testId }: { 
  question: string; 
  answer: string; 
  isOpen: boolean; 
  onClick: () => void;
  testId: string;
}) {
  return (
    <div 
      className="border border-white/10 rounded-lg overflow-hidden bg-white/5"
      data-testid={testId}
    >
      <button
        onClick={onClick}
        className="w-full flex items-center justify-between p-6 text-left"
        data-testid={`${testId}-button`}
      >
        <span className="text-white font-medium pr-4">{question}</span>
        <ChevronDown 
          className={`w-5 h-5 text-white/50 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      <motion.div
        initial={false}
        animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
        transition={{ duration: 0.3 }}
        className="overflow-hidden"
      >
        <div className="px-6 pb-6">
          <p className="text-white/50">{answer}</p>
        </div>
      </motion.div>
    </div>
  );
}

export default function FAQ() {
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});

  const toggleItem = (id: string) => {
    setOpenItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-[rgb(18,18,18)]"
    >
      <Navigation />
      
      {/* Hero Section with Video Background */}
      <section className="relative h-[50vh] min-h-[350px] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 w-full h-full">
          <Video 
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
          <div className="absolute inset-0 bg-black/60" />
        </div>
        <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-block px-4 py-2 mb-6 rounded-full text-xs font-medium tracking-[0.2em] uppercase border border-white/20 text-white/80 bg-white/5">
              Support
            </span>
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-light text-white mb-6">
              Frequently Asked <span className="italic" style={{ fontFamily: "'Outfit', sans-serif", color: 'rgb(142, 132, 247)' }}>Questions</span>
            </h1>
            <p className="text-xl text-white/50 font-light max-w-2xl mx-auto">
              Everything you need to know about working with Anker.
            </p>
          </motion.div>
        </div>
      </section>

      <div className="py-24 max-w-4xl mx-auto px-6">
        {/* Back Button */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-12"
        >
          <Link href="/" className="inline-flex items-center text-white/50 hover:text-white transition-colors text-sm" data-testid="link-back">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Home
          </Link>
        </motion.div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span 
            className="inline-block px-4 py-2 mb-6 rounded-full text-xs font-medium tracking-[0.2em] uppercase border border-white/20 text-white/80 bg-white/5"
            data-testid="badge-faq"
          >
            FAQ
          </span>
          <h1 className="text-5xl md:text-6xl font-light text-white mb-6" data-testid="text-faq-title">
            Frequently Asked
            <br />
            <span className="italic" style={{ fontFamily: "'Outfit', sans-serif", color: 'rgb(142, 132, 247)' }}>
              Questions
            </span>
          </h1>
          <p className="text-xl text-white/50 font-light max-w-2xl mx-auto">
            Everything you need to know about working with us.
          </p>
        </motion.div>

        {/* FAQ Categories */}
        <div className="space-y-12">
          {faqCategories.map((category, catIdx) => (
            <motion.div
              key={category.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 + catIdx * 0.1 }}
            >
              <h2 className="text-2xl font-light text-white mb-6" data-testid={`category-${catIdx}`}>
                {category.title}
              </h2>
              <div className="space-y-4">
                {category.items.map((item, itemIdx) => {
                  const itemId = `${catIdx}-${itemIdx}`;
                  return (
                    <AccordionItem
                      key={itemId}
                      question={item.question}
                      answer={item.answer}
                      isOpen={openItems[itemId] || false}
                      onClick={() => toggleItem(itemId)}
                      testId={`faq-item-${itemId}`}
                    />
                  );
                })}
              </div>
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="mt-16 text-center p-8 rounded-2xl border border-white/10 bg-white/5"
        >
          <h3 className="text-2xl font-light text-white mb-4">Still have questions?</h3>
          <p className="text-white/50 mb-6">We're here to help. Reach out and we'll get back to you within 24 hours.</p>
          <Link href="/contact">
            <Secondary text="Contact Us" link="/contact" />
          </Link>
        </motion.div>
      </div>
    </motion.div>
  );
}
