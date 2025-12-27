import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Mail, Lock, User, ArrowRight, Loader2, Check, X } from "lucide-react";
import Video from '@/framer/video';

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

const passwordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Must contain at least one uppercase letter")
  .regex(/[a-z]/, "Must contain at least one lowercase letter")
  .regex(/[0-9]/, "Must contain at least one number");

const registerSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: passwordSchema,
  confirmPassword: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type LoginFormData = z.infer<typeof loginSchema>;
type RegisterFormData = z.infer<typeof registerSchema>;

export default function AuthLanding() {
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const { login, register, isLoggingIn, isRegistering, isAuthenticated, user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      setLocation("/app/dashboard");
    }
  }, [isLoading, isAuthenticated, user, setLocation]);

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const registerForm = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", confirmPassword: "", firstName: "", lastName: "" },
  });

  const watchPassword = registerForm.watch("password");
  const passwordRequirements = [
    { label: "At least 8 characters", met: watchPassword?.length >= 8 },
    { label: "One uppercase letter", met: /[A-Z]/.test(watchPassword || "") },
    { label: "One lowercase letter", met: /[a-z]/.test(watchPassword || "") },
    { label: "One number", met: /[0-9]/.test(watchPassword || "") },
  ];

  const handleLogin = async (data: LoginFormData) => {
    setError(null);
    try {
      await login(data);
      setLocation("/app/dashboard");
    } catch (err: any) {
      const message = err?.message || "Login failed. Please try again.";
      setError(message);
    }
  };

  const handleRegister = async (data: RegisterFormData) => {
    setError(null);
    try {
      await register(data);
      setLocation("/app/dashboard");
    } catch (err: any) {
      const message = err?.message || "Registration failed. Please try again.";
      setError(message);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[rgb(142,132,247)] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[rgb(18,18,18)] text-white flex flex-col">
      <div className="fixed inset-0 -z-10">
        <Video 
          file="https://videos.pexels.com/video-files/3129671/3129671-uhd_2560_1440_30fps.mp4"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: 0.3,
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[rgb(18,18,18)]/90 via-[rgb(18,18,18)]/70 to-[rgb(18,18,18)]/90" />
      </div>

      <nav className="relative z-10 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <a href="/" className="flex items-center gap-3" data-testid="link-logo">
            <span className="text-xl font-light tracking-wider text-white">
              Anker<sup className="text-xs">®</sup>
            </span>
          </a>
          <a 
            href="/" 
            className="text-white/60 hover:text-white text-sm transition-colors"
            data-testid="link-back-home"
          >
            Back to Home
          </a>
        </div>
      </nav>

      <main className="relative z-10 flex-1 flex items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-8">
            <h1 className="text-3xl font-light text-white mb-2" data-testid="text-auth-title">
              {isLogin ? "Welcome back" : "Create an account"}
            </h1>
            <p className="text-white/60">
              {isLogin 
                ? "Sign in to access your investor platform" 
                : "Join Anker to connect with investors"}
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8">
            <div className="flex gap-2 mb-6">
              <button
                type="button"
                onClick={() => { setIsLogin(true); setError(null); }}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                  isLogin 
                    ? "bg-[rgb(142,132,247)] text-white" 
                    : "bg-white/5 text-white/60 hover:text-white"
                }`}
                data-testid="button-tab-login"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setIsLogin(false); setError(null); }}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                  !isLogin 
                    ? "bg-[rgb(142,132,247)] text-white" 
                    : "bg-white/5 text-white/60 hover:text-white"
                }`}
                data-testid="button-tab-register"
              >
                Sign Up
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm" data-testid="text-auth-error">
                {error}
              </div>
            )}

            {isLogin ? (
              <Form {...loginForm}>
                <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                  <FormField
                    control={loginForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white/80">Email</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                            <Input
                              type="email"
                              autoComplete="email"
                              placeholder="you@example.com"
                              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[rgb(142,132,247)]"
                              data-testid="input-login-email"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={loginForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white/80">Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                            <Input
                              type="password"
                              autoComplete="current-password"
                              placeholder="Enter your password"
                              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[rgb(142,132,247)]"
                              data-testid="input-login-password"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    disabled={isLoggingIn}
                    className="w-full bg-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/90 text-white"
                    data-testid="button-login-submit"
                  >
                    {isLoggingIn ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        Sign In
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            ) : (
              <Form {...registerForm}>
                <form onSubmit={registerForm.handleSubmit(handleRegister)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={registerForm.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-white/80">First Name</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                              <Input
                                id="register-firstname"
                                name="firstName"
                                autoComplete="given-name"
                                placeholder="John"
                                className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[rgb(142,132,247)]"
                                data-testid="input-register-firstname"
                                value={field.value}
                                onChange={field.onChange}
                                onBlur={field.onBlur}
                                ref={field.ref}
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-white/80">Last Name</FormLabel>
                          <FormControl>
                            <Input
                              id="register-lastname"
                              name="lastName"
                              autoComplete="family-name"
                              placeholder="Doe"
                              className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[rgb(142,132,247)]"
                              data-testid="input-register-lastname"
                              value={field.value}
                              onChange={field.onChange}
                              onBlur={field.onBlur}
                              ref={field.ref}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={registerForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white/80">Email</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                            <Input
                              id="register-email"
                              name="email"
                              type="email"
                              autoComplete="email"
                              placeholder="you@example.com"
                              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[rgb(142,132,247)]"
                              data-testid="input-register-email"
                              value={field.value}
                              onChange={field.onChange}
                              onBlur={field.onBlur}
                              ref={field.ref}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={registerForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white/80">Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                            <Input
                              id="register-password"
                              name="password"
                              type="password"
                              autoComplete="new-password"
                              placeholder="Create a strong password"
                              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[rgb(142,132,247)]"
                              data-testid="input-register-password"
                              value={field.value}
                              onChange={field.onChange}
                              onBlur={field.onBlur}
                              ref={field.ref}
                            />
                          </div>
                        </FormControl>
                        <div className="mt-2 space-y-1">
                          {passwordRequirements.map((req, index) => (
                            <div 
                              key={index}
                              className={`flex items-center gap-2 text-xs ${
                                req.met ? "text-green-400" : "text-white/40"
                              }`}
                              data-testid={`password-req-${index}`}
                            >
                              {req.met ? (
                                <Check className="w-3 h-3" />
                              ) : (
                                <X className="w-3 h-3" />
                              )}
                              {req.label}
                            </div>
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={registerForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white/80">Confirm Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                            <Input
                              id="register-confirm-password"
                              name="confirmPassword"
                              type="password"
                              autoComplete="new-password"
                              placeholder="Re-enter your password"
                              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[rgb(142,132,247)]"
                              data-testid="input-register-confirm-password"
                              value={field.value}
                              onChange={field.onChange}
                              onBlur={field.onBlur}
                              ref={field.ref}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    disabled={isRegistering}
                    className="w-full bg-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/90 text-white"
                    data-testid="button-register-submit"
                  >
                    {isRegistering ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        Create Account
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            )}

            <p className="text-xs text-white/40 text-center mt-6">
              By continuing, you agree to our Terms of Service and Privacy Policy.
            </p>
          </div>
        </motion.div>
      </main>

      <footer className="relative z-10 py-6 border-t border-white/10">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <p className="text-white/30 text-sm">
            © 2024 Anker. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
