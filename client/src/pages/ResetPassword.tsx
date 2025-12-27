import { useState, useEffect } from "react";
import { Link, useSearch, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Lock, ArrowLeft, CheckCircle, Loader2, XCircle, Eye, EyeOff } from "lucide-react";
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

const resetPasswordSchema = z.object({
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;

export default function ResetPassword() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("token");
  
  const [resetSuccess, setResetSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const form = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  // Verify token on mount
  const { data: tokenValidation, isLoading: isVerifying } = useQuery({
    queryKey: ["/api/auth/verify-reset-token", token],
    queryFn: async () => {
      if (!token) return { valid: false };
      const response = await fetch(`/api/auth/verify-reset-token?token=${token}`);
      return response.json() as Promise<{ valid: boolean; message?: string }>;
    },
    enabled: !!token,
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (data: ResetPasswordForm) => {
      const response = await apiRequest("POST", "/api/auth/reset-password", {
        token,
        password: data.password,
        confirmPassword: data.confirmPassword,
      });
      return response as unknown as { success: boolean; message: string };
    },
    onSuccess: (data) => {
      if (data.success) {
        setResetSuccess(true);
        toast({
          title: "Password Reset",
          description: "Your password has been reset successfully.",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reset password",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ResetPasswordForm) => {
    resetPasswordMutation.mutate(data);
  };

  // No token provided
  if (!token) {
    return (
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Invalid Link</h1>
            <p className="text-white/60 mb-6">
              This password reset link is invalid. Please request a new one.
            </p>
            <Link href="/forgot-password">
              <Button 
                className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-black font-semibold"
                data-testid="button-request-new-link"
              >
                Request New Link
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  // Verifying token
  if (isVerifying) {
    return (
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <Loader2 className="w-8 h-8 text-[rgb(142,132,247)] animate-spin mx-auto mb-4" />
          <p className="text-white/60">Verifying reset link...</p>
        </motion.div>
      </div>
    );
  }

  // Token invalid or expired
  if (tokenValidation && !tokenValidation.valid) {
    return (
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Link Expired</h1>
            <p className="text-white/60 mb-6">
              This password reset link has expired or has already been used. Please request a new one.
            </p>
            <Link href="/forgot-password">
              <Button 
                className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-black font-semibold"
                data-testid="button-request-new-link"
              >
                Request New Link
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 p-8">
          {resetSuccess ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-6"
            >
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[rgb(142,132,247)]/20 to-[rgb(251,194,213)]/20 border border-white/10 flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-[rgb(142,132,247)]" />
              </div>
              
              <div>
                <h1 className="text-2xl font-bold text-white mb-2">Password Reset!</h1>
                <p className="text-white/60">
                  Your password has been successfully reset. You can now sign in with your new password.
                </p>
              </div>
              
              <Link href="/auth">
                <Button 
                  className="w-full h-12 bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-black font-semibold"
                  data-testid="button-go-to-login"
                >
                  Go to Sign In
                </Button>
              </Link>
            </motion.div>
          ) : (
            <>
              <div className="text-center mb-8">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[rgb(142,132,247)]/20 to-[rgb(251,194,213)]/20 border border-white/10 flex items-center justify-center mx-auto mb-4">
                  <Lock className="w-8 h-8 text-[rgb(142,132,247)]" />
                </div>
                <h1 className="text-2xl font-bold text-white mb-2">Reset Password</h1>
                <p className="text-white/60">
                  Enter your new password below.
                </p>
              </div>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white/80">New Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showPassword ? "text" : "password"}
                              placeholder="Enter new password"
                              className="bg-white/5 border-white/10 text-white placeholder:text-white/40 h-12 pr-12"
                              data-testid="input-new-password"
                              {...field}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
                              data-testid="button-toggle-password"
                            >
                              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage className="text-red-400" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white/80">Confirm Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showConfirmPassword ? "text" : "password"}
                              placeholder="Confirm new password"
                              className="bg-white/5 border-white/10 text-white placeholder:text-white/40 h-12 pr-12"
                              data-testid="input-confirm-password"
                              {...field}
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
                              data-testid="button-toggle-confirm-password"
                            >
                              {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage className="text-red-400" />
                      </FormItem>
                    )}
                  />

                  <div className="text-xs text-white/40 space-y-1">
                    <p>Password must:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li>Be at least 8 characters long</li>
                      <li>Contain at least one uppercase letter</li>
                      <li>Contain at least one lowercase letter</li>
                      <li>Contain at least one number</li>
                    </ul>
                  </div>

                  <Button
                    type="submit"
                    disabled={resetPasswordMutation.isPending}
                    className="w-full h-12 bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-black font-semibold"
                    data-testid="button-reset-password"
                  >
                    {resetPasswordMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Resetting...
                      </>
                    ) : (
                      "Reset Password"
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
