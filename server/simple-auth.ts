import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { Router, Request, Response, NextFunction } from "express";
import { db } from "./db";
import { users, ADMIN_EMAILS, passwordResetTokens } from "@shared/models/auth";
import { eq, and, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { sendPasswordResetEmail } from "./services/resend";
import { csrfProtection } from "./middleware/security";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function verifyPassword(storedPassword: string, suppliedPassword: string): Promise<boolean> {
  const [hashedPassword, salt] = storedPassword.split(".");
  const hashedPasswordBuf = Buffer.from(hashedPassword, "hex");
  const suppliedPasswordBuf = (await scryptAsync(suppliedPassword, salt, 64)) as Buffer;
  return timingSafeEqual(hashedPasswordBuf, suppliedPasswordBuf);
}

const passwordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

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

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000;

// Rate limiting for password reset requests
const passwordResetAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_RESET_ATTEMPTS = 3; // Max 3 reset requests per email
const RESET_LOCKOUT_DURATION = 60 * 60 * 1000; // 1 hour lockout

function checkPasswordResetRateLimit(email: string): { allowed: boolean; remainingTime?: number } {
  const now = Date.now();
  const attempts = passwordResetAttempts.get(email);
  
  if (!attempts) {
    return { allowed: true };
  }
  
  if (now - attempts.lastAttempt > RESET_LOCKOUT_DURATION) {
    passwordResetAttempts.delete(email);
    return { allowed: true };
  }
  
  if (attempts.count >= MAX_RESET_ATTEMPTS) {
    const remainingTime = Math.ceil((RESET_LOCKOUT_DURATION - (now - attempts.lastAttempt)) / 1000 / 60);
    return { allowed: false, remainingTime };
  }
  
  return { allowed: true };
}

function recordPasswordResetAttempt(email: string) {
  const now = Date.now();
  const attempts = passwordResetAttempts.get(email);
  
  if (!attempts || now - attempts.lastAttempt > RESET_LOCKOUT_DURATION) {
    passwordResetAttempts.set(email, { count: 1, lastAttempt: now });
  } else {
    passwordResetAttempts.set(email, { count: attempts.count + 1, lastAttempt: now });
  }
}

function checkRateLimit(email: string): { allowed: boolean; remainingTime?: number } {
  const now = Date.now();
  const attempts = loginAttempts.get(email);
  
  if (!attempts) {
    return { allowed: true };
  }
  
  if (now - attempts.lastAttempt > LOCKOUT_DURATION) {
    loginAttempts.delete(email);
    return { allowed: true };
  }
  
  if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
    const remainingTime = Math.ceil((LOCKOUT_DURATION - (now - attempts.lastAttempt)) / 1000 / 60);
    return { allowed: false, remainingTime };
  }
  
  return { allowed: true };
}

function recordFailedAttempt(email: string) {
  const now = Date.now();
  const attempts = loginAttempts.get(email);
  
  if (!attempts || now - attempts.lastAttempt > LOCKOUT_DURATION) {
    loginAttempts.set(email, { count: 1, lastAttempt: now });
  } else {
    loginAttempts.set(email, { count: attempts.count + 1, lastAttempt: now });
  }
}

function clearFailedAttempts(email: string) {
  loginAttempts.delete(email);
}

export function registerSimpleAuthRoutes(app: Router) {
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const result = registerSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ 
          message: result.error.errors[0]?.message || "Invalid input" 
        });
      }

      const { email, password, firstName, lastName } = result.data;
      const normalizedEmail = email.toLowerCase().trim();

      const existingUser = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
      if (existingUser.length > 0) {
        return res.status(400).json({ message: "Unable to create account. Please try a different email." });
      }

      const hashedPassword = await hashPassword(password);
      const isAdmin = ADMIN_EMAILS.includes(normalizedEmail);

      const [newUser] = await db.insert(users).values({
        email: normalizedEmail,
        password: hashedPassword,
        firstName: firstName || null,
        lastName: lastName || null,
        isAdmin,
        onboardingCompleted: null,
      }).returning();

      // Regenerate session to prevent session fixation attacks
      const userData = { ...newUser };
      req.session.regenerate((err) => {
        if (err) {
          console.error("Session regeneration error:", err);
          return res.status(500).json({ message: "Account created but login failed" });
        }
        
        (req.session as any).userId = userData.id;
        
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("Session save error:", saveErr);
            return res.status(500).json({ message: "Account created but login failed" });
          }
          
          const { password: _, ...userWithoutPassword } = userData;
          res.status(201).json(userWithoutPassword);
        });
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Failed to create account" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const result = loginSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid email or password" });
      }

      const { email, password } = result.data;
      const normalizedEmail = email.toLowerCase().trim();

      const rateLimit = checkRateLimit(normalizedEmail);
      if (!rateLimit.allowed) {
        return res.status(429).json({ 
          message: `Too many login attempts. Please try again in ${rateLimit.remainingTime} minutes.` 
        });
      }

      const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
      if (!user || !user.password) {
        recordFailedAttempt(normalizedEmail);
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const isValid = await verifyPassword(user.password, password);
      if (!isValid) {
        recordFailedAttempt(normalizedEmail);
        return res.status(401).json({ message: "Invalid email or password" });
      }

      clearFailedAttempts(normalizedEmail);
      
      // Regenerate session to prevent session fixation attacks
      const userData = { ...user };
      req.session.regenerate((err) => {
        if (err) {
          console.error("Session regeneration error:", err);
          return res.status(500).json({ message: "Login failed" });
        }
        
        (req.session as any).userId = userData.id;
        
        // Save session before sending response
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("Session save error:", saveErr);
            return res.status(500).json({ message: "Login failed" });
          }
          
          const { password: _, ...userWithoutPassword } = userData;
          res.json(userWithoutPassword);
        });
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // SECURITY: Logout requires CSRF protection to prevent attackers from logging out users
  app.post("/api/auth/logout", csrfProtection, (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/auth/user", async (req: Request, res: Response) => {
    const userId = (req.session as any)?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const { password: _, ...userWithoutPassword } = user;
      console.log("[Auth] User fetched:", { id: user.id, email: user.email, isAdmin: user.isAdmin });
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ message: "Failed to get user" });
    }
  });

  // SECURITY: Removed GET /api/logout as it's a security anti-pattern
  // (GET requests should not modify state, and this was vulnerable to CSRF via image/script tags)
  // Use POST /api/auth/logout with CSRF token instead

  app.get("/api/login", (req: Request, res: Response) => {
    res.redirect("/auth");
  });

  // SECURITY: Removed insecure admin password reset endpoint that used static secret key
  // Admin password resets should use the secure token-based /api/auth/forgot-password flow
  // or be performed through direct database access by authorized personnel

  // Request password reset - sends email with reset link
  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }
    
    const normalizedEmail = email.toLowerCase().trim();
    
    // Rate limit password reset requests
    const rateLimitCheck = checkPasswordResetRateLimit(normalizedEmail);
    if (!rateLimitCheck.allowed) {
      return res.status(429).json({ 
        message: `Too many password reset attempts. Please try again in ${rateLimitCheck.remainingTime} minutes.` 
      });
    }
    
    // Record this attempt (regardless of whether user exists)
    recordPasswordResetAttempt(normalizedEmail);
    
    try {
      // Check if user exists (don't reveal if they do or not for security)
      const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
      
      // Always return success message to prevent email enumeration
      if (!user) {
        return res.json({ 
          success: true, 
          message: "If an account exists with that email, you will receive a password reset link." 
        });
      }
      
      // Generate secure random token
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
      
      // Delete any existing reset tokens for this user
      await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
      
      // Create new reset token
      await db.insert(passwordResetTokens).values({
        userId: user.id,
        token,
        expiresAt,
      });
      
      // Build reset link - use request host for proper domain
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers.host || 'localhost:5000';
      const resetLink = `${protocol}://${host}/reset-password?token=${token}`;
      
      // Send reset email
      await sendPasswordResetEmail(
        user.email!,
        resetLink,
        user.firstName || undefined
      );
      
      res.json({ 
        success: true, 
        message: "If an account exists with that email, you will receive a password reset link." 
      });
    } catch (error: any) {
      console.error("Password reset request error:", error);
      res.status(500).json({ message: "Failed to process password reset request" });
    }
  });

  // Verify reset token is valid
  app.get("/api/auth/verify-reset-token", async (req: Request, res: Response) => {
    const { token } = req.query;
    
    if (!token || typeof token !== "string") {
      return res.status(400).json({ valid: false, message: "Token is required" });
    }
    
    try {
      const [resetToken] = await db.select()
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.token, token),
            gt(passwordResetTokens.expiresAt, new Date()),
            isNull(passwordResetTokens.usedAt)
          )
        )
        .limit(1);
      
      if (!resetToken) {
        return res.json({ valid: false, message: "Invalid or expired reset token" });
      }
      
      res.json({ valid: true });
    } catch (error: any) {
      console.error("Token verification error:", error);
      res.status(500).json({ valid: false, message: "Failed to verify token" });
    }
  });

  // Reset password with token
  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    const { token, password, confirmPassword } = req.body;
    
    if (!token || !password) {
      return res.status(400).json({ message: "Token and password are required" });
    }
    
    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }
    
    // Validate password strength
    const passwordValidation = passwordSchema.safeParse(password);
    if (!passwordValidation.success) {
      return res.status(400).json({ 
        message: passwordValidation.error.errors[0]?.message || "Invalid password" 
      });
    }
    
    try {
      // Find valid token
      const [resetToken] = await db.select()
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.token, token),
            gt(passwordResetTokens.expiresAt, new Date()),
            isNull(passwordResetTokens.usedAt)
          )
        )
        .limit(1);
      
      if (!resetToken) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }
      
      // Hash the new password
      const hashedPassword = await hashPassword(password);
      
      // Update user password
      await db.update(users)
        .set({ password: hashedPassword, updatedAt: new Date() })
        .where(eq(users.id, resetToken.userId));
      
      // Mark token as used
      await db.update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, resetToken.id));
      
      res.json({ success: true, message: "Password has been reset successfully" });
    } catch (error: any) {
      console.error("Password reset error:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });
}

export function simpleAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}

export function setupSimpleAuthSession(app: Router) {
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req.session as any)?.userId;
    
    // Debug logging for session issues
    if (req.path.startsWith('/api/admin') || req.path === '/api/auth/user') {
      console.log("[setupSimpleAuthSession] Route hit:", req.method, req.path);
      console.log("[setupSimpleAuthSession] Session exists:", !!req.session);
      console.log("[setupSimpleAuthSession] Session ID:", (req as any).sessionID);
      console.log("[setupSimpleAuthSession] userId from session:", userId);
      console.log("[setupSimpleAuthSession] Cookie header:", req.headers.cookie ? "present" : "missing");
    }
    
    if (userId) {
      try {
        const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (user) {
          const { password: _, ...userWithoutPassword } = user;
          (req as any).user = userWithoutPassword;
          (req as any).isAuthenticated = () => true;
        } else {
          (req as any).isAuthenticated = () => false;
        }
      } catch (error) {
        (req as any).isAuthenticated = () => false;
      }
    } else {
      (req as any).isAuthenticated = () => false;
    }
    next();
  });
}
