import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertMessageSchema } from "@shared/schema";
import { useCreateMessage } from "@/hooks/use-messages";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import FAQ from '@/framer/faq'; // Using Framer FAQ component

// Re-using ShadCN UI components inside our custom form wrapper
// to ensure it matches the high-quality aesthetic but functions perfectly.

export default function Contact() {
  const mutation = useCreateMessage();

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
      onSuccess: () => form.reset()
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
              <h1 className="text-5xl font-bold mb-6">Get in Touch</h1>
              <p className="text-xl text-muted-foreground">
                Interested in partnering with us? Have a project we should see? 
                Drop us a line.
              </p>
            </div>

            <div className="bg-card border rounded-3xl p-8 shadow-sm">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" className="bg-background border-border/50 h-12 rounded-xl" {...field} />
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
                          <Input placeholder="john@example.com" className="bg-background border-border/50 h-12 rounded-xl" {...field} />
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
                            className="bg-background border-border/50 min-h-[150px] rounded-xl resize-none" 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <button
                    type="submit"
                    disabled={mutation.isPending}
                    className="w-full py-4 rounded-xl font-bold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all shadow-lg shadow-primary/20"
                  >
                    {mutation.isPending ? "Sending..." : "Send Message"}
                  </button>
                </form>
              </Form>
            </div>
            
            <div className="mt-12">
              <h4 className="font-bold mb-4">Contact Info</h4>
              <p className="text-muted-foreground">hello@anker.vc</p>
              <p className="text-muted-foreground">+1 (555) 123-4567</p>
              <p className="text-muted-foreground mt-4">
                123 Blockchain Blvd<br />
                San Francisco, CA 94107
              </p>
            </div>
          </div>

          {/* Right Column: FAQ */}
          <div>
            <h2 className="text-3xl font-bold mb-8">Frequently Asked Questions</h2>
            <div className="space-y-4">
              {/* Using the Framer FAQ component. 
                  If it doesn't support children/slots, we render it as is. 
                  Assuming it's a visual list. */}
              <FAQ.Responsive />
              
              {/* Fallback accordion items if Framer component is empty */}
              <div className="space-y-4 mt-8">
                <div className="p-6 rounded-2xl border bg-card/50">
                  <h3 className="font-bold text-lg mb-2">What stage companies do you invest in?</h3>
                  <p className="text-muted-foreground">We primarily focus on Seed and Series A rounds, but we are flexible for exceptional founders.</p>
                </div>
                <div className="p-6 rounded-2xl border bg-card/50">
                  <h3 className="font-bold text-lg mb-2">Do you lead rounds?</h3>
                  <p className="text-muted-foreground">Yes, we are comfortable leading rounds and taking board seats to actively support our portfolio companies.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
