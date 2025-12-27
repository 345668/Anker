import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { Router, Request, Response, NextFunction } from "express";
import { db } from "./db";
import { users, ADMIN_EMAILS } from "@shared/models/auth";
import { eq } from "drizzle-orm";
import { z } from "zod";

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

      (req.session as any).userId = newUser.id;

      const { password: _, ...userWithoutPassword } = newUser;
      res.status(201).json(userWithoutPassword);
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
      (req.session as any).userId = user.id;

      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
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
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ message: "Failed to get user" });
    }
  });

  app.get("/api/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
      res.redirect("/auth");
    });
  });

  app.get("/api/login", (req: Request, res: Response) => {
    res.redirect("/auth");
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
