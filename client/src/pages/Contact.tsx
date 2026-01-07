import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertMessageSchema } from "@shared/schema";
import { useCreateMessage } from "@/hooks/use-messages";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Link } from "wouter";
import { ChevronLeft, Send, Mail, MapPin, Linkedin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Import Framer component
import Secondary from '@/framer/secondary';
import Accordion from '@/framer/accordion';
import Video from '@/framer/video';

const faqItems = [
  {
    question: "What is Anker Consulting?",
    answer: "Anker Consulting is a platform that helps startups connect with the right investors through AI-powered matching, pitch deck analysis, and deal flow management."
  },
  {
    question: "How does investor matching work?",
    answer: "Our AI analyzes your startup profile, industry, stage, and funding needs to match you with investors who have relevant experience and investment focus."
  },
  {
    question: "What features are included?",
    answer: "The platform includes investor matching, pitch deck analysis, CRM integration, email outreach tools, deal rooms, and professional PDF reports."
  },
  {
    question: "How do I get started?",
    answer: "Sign up with your account, complete your startup profile, upload your pitch deck, and start generating investor matches immediately."
  },
  {
    question: "Is there a cost to use the platform?",
    answer: "Contact us through this form to learn about our pricing plans and find the best option for your startup."
  }
];

// Navigation Component matching Framer design
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
              className="text-white/70 text-sm font-light hover:text-white transition-colors"
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

export default function Contact() {
  const mutation = useCreateMessage();
  const { toast } = useToast();

  const form = useForm({
    resolver: zodResolver(insertMessageSchema),
    defaultValues: {
      name: "",
      email: "",
      message: ""
    }
  });

  const onSubmit = (data: any) => {
    mutation.mutate(data, {
      onSuccess: () => {
        form.reset();
        toast({
          title: "Message sent!",
          description: "We'll get back to you within 48 hours.",
        });
      },
      onError: () => {
        toast({
          title: "Error",
          description: "Failed to send message. Please try again.",
          variant: "destructive",
        });
      }
    });
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
            file="https://framerusercontent.com/assets/vbOBoy0MLbMZbX0cLl9GPpNhA.mp4"
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
              Contact Us
            </span>
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-light text-white mb-6" data-testid="text-contact-title">
              Get in <span className="italic" style={{ fontFamily: "'Outfit', sans-serif", color: 'rgb(142, 132, 247)' }}>Touch</span>
            </h1>
            <p className="text-xl text-white/50 font-light max-w-2xl mx-auto">
              Have a project in mind? We'd love to hear from you.
            </p>
          </motion.div>
        </div>
      </section>

      <div className="py-24 max-w-7xl mx-auto px-6">
        {/* Back Button */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-12"
        >
          <Link href="/" className="inline-flex items-center text-white/50 hover:text-white transition-colors text-sm">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Home
          </Link>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
          {/* Left Column - Info & Form */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >

            {/* Contact Info */}
            <div className="space-y-6 mb-12">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full border border-white/20 flex items-center justify-center text-white/50">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-white/40 text-sm">Email</p>
                  <p className="text-white">sales@philippemasindet.com</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full border border-white/20 flex items-center justify-center text-white/50">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-white/40 text-sm">Location</p>
                  <p className="text-white">Berlin, Germany</p>
                </div>
              </div>
              
              <a 
                href="https://www.linkedin.com/in/philippe-m-masindet/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-4 hover:opacity-80 transition-opacity"
                data-testid="link-linkedin"
              >
                <div className="w-12 h-12 rounded-full border border-white/20 flex items-center justify-center text-white/50">
                  <Linkedin className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-white/40 text-sm">LinkedIn</p>
                  <p className="text-white">Philippe M. Masindet</p>
                </div>
              </a>
            </div>

            {/* Contact Form */}
            <div className="p-8 rounded-2xl border border-white/10 bg-white/5">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white/50 text-sm">Name *</FormLabel>
                        <FormControl>
                          <input 
                            placeholder="Your name" 
                            data-testid="input-name"
                            className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-white/30 focus:outline-none transition-colors"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage className="text-red-400" />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white/50 text-sm">Email *</FormLabel>
                        <FormControl>
                          <input 
                            placeholder="your@email.com" 
                            type="email"
                            data-testid="input-email"
                            className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-white/30 focus:outline-none transition-colors"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage className="text-red-400" />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="message"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white/50 text-sm">Message *</FormLabel>
                        <FormControl>
                          <textarea 
                            placeholder="Tell us about your project..." 
                            rows={5}
                            data-testid="input-message"
                            className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-white/30 focus:outline-none transition-colors resize-none"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage className="text-red-400" />
                      </FormItem>
                    )}
                  />

                  <button
                    type="submit"
                    disabled={mutation.isPending}
                    className="w-full py-4 rounded-full bg-white text-black font-medium hover:bg-white/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    data-testid="button-submit-contact"
                  >
                    {mutation.isPending ? (
                      "Sending..."
                    ) : (
                      <>
                        Send Message
                        <Send className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              </Form>
            </div>
          </motion.div>

          {/* Right Column - FAQ */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <h2 className="text-3xl font-light text-white mb-8" data-testid="text-faq-title">
              Frequently Asked Questions
            </h2>
            <div className="space-y-4">
              {faqItems.map((item, idx) => (
                <div 
                  key={idx}
                  className="p-6 rounded-lg border border-white/10 bg-white/5"
                  data-testid={`accordion-item-${idx}`}
                >
                  <h3 className="text-white font-medium mb-2">{item.question}</h3>
                  <p className="text-white/50 text-sm">{item.answer}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
