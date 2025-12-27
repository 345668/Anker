import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Mail, ArrowLeft, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPassword() {
  const { toast } = useToast();
  const [emailSent, setEmailSent] = useState(false);

  const form = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: async (data: ForgotPasswordForm) => {
      const response = await apiRequest("POST", "/api/auth/forgot-password", data);
      return response as unknown as { success: boolean; message: string };
    },
    onSuccess: (data) => {
      if (data.success) {
        setEmailSent(true);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send reset email",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ForgotPasswordForm) => {
    forgotPasswordMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 p-8">
          {emailSent ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-6"
            >
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[rgb(142,132,247)]/20 to-[rgb(251,194,213)]/20 border border-white/10 flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-[rgb(142,132,247)]" />
              </div>
              
              <div>
                <h1 className="text-2xl font-bold text-white mb-2">Check Your Email</h1>
                <p className="text-white/60">
                  If an account exists with that email, we've sent you a link to reset your password.
                </p>
              </div>
              
              <p className="text-white/40 text-sm">
                The link will expire in 1 hour. Check your spam folder if you don't see it.
              </p>
              
              <Link href="/auth">
                <Button 
                  variant="ghost" 
                  className="text-[rgb(142,132,247)] hover:text-[rgb(142,132,247)]/80"
                  data-testid="link-back-to-login"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Login
                </Button>
              </Link>
            </motion.div>
          ) : (
            <>
              <div className="text-center mb-8">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[rgb(142,132,247)]/20 to-[rgb(251,194,213)]/20 border border-white/10 flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-8 h-8 text-[rgb(142,132,247)]" />
                </div>
                <h1 className="text-2xl font-bold text-white mb-2">Forgot Password?</h1>
                <p className="text-white/60">
                  Enter your email and we'll send you a link to reset your password.
                </p>
              </div>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white/80">Email</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="you@example.com"
                            className="bg-white/5 border-white/10 text-white placeholder:text-white/40 h-12"
                            data-testid="input-forgot-email"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage className="text-red-400" />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    disabled={forgotPasswordMutation.isPending}
                    className="w-full h-12 bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-black font-semibold"
                    data-testid="button-send-reset"
                  >
                    {forgotPasswordMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      "Send Reset Link"
                    )}
                  </Button>
                </form>
              </Form>

              <div className="mt-6 text-center">
                <Link href="/auth">
                  <Button 
                    variant="ghost" 
                    className="text-white/60 hover:text-white"
                    data-testid="link-back-to-login"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Login
                  </Button>
                </Link>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
