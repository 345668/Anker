import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertMessageSchema } from "@shared/schema";
import { useCreateMessage } from "@/hooks/use-messages";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Mail, Phone, MapPin, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const faqItems = [
  {
    question: "What stage companies do you invest in?",
    answer: "We primarily focus on Seed and Series A rounds, but we are flexible for exceptional founders with compelling visions. We've also participated in pre-seed and Series B rounds when the opportunity is right."
  },
  {
    question: "Do you lead rounds?",
    answer: "Yes, we are comfortable leading rounds and taking board seats to actively support our portfolio companies. We believe in being hands-on partners rather than passive investors."
  },
  {
    question: "What sectors do you focus on?",
    answer: "We invest across four key sectors: Crypto & Blockchain, Technology, Healthcare, and Finance. We're particularly excited about companies at the intersection of these sectors."
  },
  {
    question: "How long does your investment process take?",
    answer: "Our typical timeline from first meeting to term sheet is 2-4 weeks. We pride ourselves on moving quickly when we're excited about an opportunity."
  },
  {
    question: "What do you look for in founders?",
    answer: "We look for founders with deep domain expertise, a clear vision, and the resilience to navigate challenges. Technical founders and repeat entrepreneurs get our attention, but we're open to all backgrounds."
  },
  {
    question: "How can I submit my pitch deck?",
    answer: "You can reach out through this contact form or email us directly at hello@anker.vc. We review every submission and aim to respond within 48 hours."
  }
];

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
      className="min-h-screen pt-24 pb-24"
    >
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
          
          {/* Left Column: Info & Form */}
          <div>
            <div className="mb-12">
              <h1 className="text-5xl font-bold mb-6" data-testid="text-contact-title">Get in Touch</h1>
              <p className="text-xl text-muted-foreground">
                Interested in partnering with us? Have a project we should see? 
                Drop us a line.
              </p>
            </div>

            <Card className="p-8">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="John Doe" 
                            data-testid="input-name"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="john@example.com" 
                            type="email"
                            data-testid="input-email"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="message"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Message</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Tell us about your project..." 
                            className="min-h-[150px] resize-none" 
                            data-testid="input-message"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    disabled={mutation.isPending}
                    className="w-full"
                    size="lg"
                    data-testid="button-submit-contact"
                  >
                    {mutation.isPending ? (
                      "Sending..."
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Send Message
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </Card>
            
            <div className="mt-12 space-y-4">
              <h4 className="font-bold text-lg mb-6">Contact Info</h4>
              <div className="flex items-center gap-3 text-muted-foreground">
                <Mail className="w-5 h-5 text-primary" />
                <span>hello@anker.vc</span>
              </div>
              <div className="flex items-center gap-3 text-muted-foreground">
                <Phone className="w-5 h-5 text-primary" />
                <span>+1 (555) 123-4567</span>
              </div>
              <div className="flex items-start gap-3 text-muted-foreground">
                <MapPin className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <span>
                  123 Blockchain Blvd<br />
                  San Francisco, CA 94107
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: FAQ */}
          <div>
            <h2 className="text-3xl font-bold mb-8" data-testid="text-faq-title">Frequently Asked Questions</h2>
            <Accordion type="single" collapsible className="space-y-4">
              {faqItems.map((item, idx) => (
                <AccordionItem 
                  key={idx} 
                  value={`item-${idx}`}
                  className="border rounded-lg px-6"
                  data-testid={`accordion-item-${idx}`}
                >
                  <AccordionTrigger className="text-left font-semibold hover:no-underline py-4">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground pb-4">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
