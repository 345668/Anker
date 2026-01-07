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
    title: "Getting Started",
    items: [
      {
        question: "What is Anker Consulting?",
        answer: "Anker Consulting is a platform designed to help startups find and connect with the right investors. We use AI-powered matching, pitch deck analysis, and CRM tools to streamline your fundraising process."
      },
      {
        question: "How do I create an account?",
        answer: "Click the 'Get Started' button on our homepage and sign up using your Replit account. Once registered, you can complete your startup profile and begin using all platform features."
      },
      {
        question: "Is Anker Consulting free to use?",
        answer: "We offer different pricing tiers to accommodate startups at various stages. Contact us through the contact page to learn about our plans and find the best option for your needs."
      },
      {
        question: "What information do I need to get started?",
        answer: "To get the most out of the platform, prepare your startup details including industry, stage, funding target, and ideally a pitch deck. The more complete your profile, the better your investor matches."
      },
    ]
  },
  {
    title: "Investor Matching",
    items: [
      {
        question: "How does investor matching work?",
        answer: "Our AI analyzes your startup profile (industry, stage, location, funding target) and compares it with investor preferences and past investments. Matches are scored based on alignment across multiple factors."
      },
      {
        question: "What types of investors are in your database?",
        answer: "Our database includes Venture Capital firms, Family Offices, Pension Funds, Angel investors, and other institutional investors from around the world, with a focus on Europe and North America."
      },
      {
        question: "How can I improve my match scores?",
        answer: "Complete your startup profile with accurate details, upload a comprehensive pitch deck, and add supporting documents. The more information we have, the better we can match you with relevant investors."
      },
    ]
  },
  {
    title: "Platform Features",
    items: [
      {
        question: "What is the Pitch Deck Analysis feature?",
        answer: "Our AI analyzes your pitch deck across multiple dimensions including team, market, traction, and financials. You receive detailed feedback and recommendations to improve your deck before investor meetings."
      },
      {
        question: "What are Deal Rooms?",
        answer: "Deal Rooms are private collaboration spaces where you can share documents, track milestones, and communicate with investors during the due diligence process."
      },
      {
        question: "Can I export reports and data?",
        answer: "Yes, you can download professional PDF reports for your pitch deck analysis and investor matches. These consulting-style reports are designed to help you prepare for fundraising."
      },
    ]
  },
  {
    title: "Support & Contact",
    items: [
      {
        question: "How can I contact support?",
        answer: "Reach out through our contact page or email us at sales@philippemasindet.com. We typically respond within 24-48 hours."
      },
      {
        question: "Is my data secure?",
        answer: "Yes, we take data security seriously. Your pitch decks and company information are encrypted and never shared with third parties without your explicit consent."
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
            file="https://framerusercontent.com/assets/MLWPbW1dUQawJLhhun3dBwpgJak.mp4"
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
