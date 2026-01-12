import { Request, Response, NextFunction, Express } from "express";
import rateLimit from "express-rate-limit";
import { randomBytes, createHmac, timingSafeEqual } from "crypto";

// ============================================================================
// GLOBAL RATE LIMITING
// ============================================================================

// General API rate limiter - 100 requests per 15 minutes per IP
// Using default keyGenerator which properly handles IPv6 addresses
export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  message: { message: "Too many requests, please try again later." },
  validate: { xForwardedForHeader: false }, // Disable validation warning for proxy setup
});

// Strict rate limiter for authentication endpoints - 10 requests per 15 minutes per IP
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 auth attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many authentication attempts, please try again later." },
  validate: { xForwardedForHeader: false },
});

// Strict rate limiter for password reset - 3 requests per hour
export const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Only 3 password reset attempts per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many password reset attempts, please try again later." },
  validate: { xForwardedForHeader: false },
});

// ============================================================================
// CSRF PROTECTION (Double-Submit Cookie Pattern)
// ============================================================================

const CSRF_SECRET = process.env.SESSION_SECRET || "csrf-fallback-secret";
const CSRF_COOKIE_NAME = "XSRF-TOKEN";
const CSRF_HEADER_NAME = "x-xsrf-token";

// Generate a signed CSRF token
function generateCsrfToken(): string {
  const raw = randomBytes(32).toString("hex");
  const hmac = createHmac("sha256", CSRF_SECRET).update(raw).digest("hex");
  return `${raw}.${hmac}`;
}

// Verify a CSRF token signature
function verifyCsrfToken(token: string): boolean {
  if (!token || !token.includes(".")) {
    return false;
  }
  const [raw, signature] = token.split(".");
  if (!raw || !signature) {
    return false;
  }
  const expectedHmac = createHmac("sha256", CSRF_SECRET).update(raw).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expectedHmac, "hex"));
  } catch {
    return false;
  }
}

// Middleware to generate CSRF token on GET requests
export function csrfTokenGenerator(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const token = generateCsrfToken();
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false, // Must be readable by JavaScript
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });
  }
  next();
}

// Middleware to validate CSRF token on state-changing requests
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Skip CSRF for safe methods
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  // Skip CSRF for API endpoints that:
  // - Use other auth mechanisms (API keys, etc.)
  // - Are webhook endpoints that receive external requests
  // - Are auth endpoints (login/register) since user doesn't have CSRF token yet
  //   (these are protected by rate limiting instead)
  // Note: /api/auth/logout REQUIRES CSRF to prevent attackers from logging out users
  const skipCsrfPaths = [
    "/api/webhooks/",
    "/api/cron/",
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
    "/api/messages", // Public contact form
    "/api/subscribers", // Public newsletter signup
  ];
  
  if (skipCsrfPaths.some(path => req.path.startsWith(path))) {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.get(CSRF_HEADER_NAME) || req.get("X-CSRF-Token");

  // Validate tokens exist and match
  if (!cookieToken || !headerToken) {
    console.warn("[CSRF] Missing token - Cookie:", !!cookieToken, "Header:", !!headerToken, "Path:", req.path);
    return res.status(403).json({ message: "CSRF token missing" });
  }

  if (cookieToken !== headerToken) {
    console.warn("[CSRF] Token mismatch - Path:", req.path);
    return res.status(403).json({ message: "CSRF token mismatch" });
  }

  if (!verifyCsrfToken(cookieToken)) {
    console.warn("[CSRF] Invalid token signature - Path:", req.path);
    return res.status(403).json({ message: "Invalid CSRF token" });
  }

  next();
}

// Endpoint to get a new CSRF token (for SPAs)
export function registerCsrfTokenEndpoint(app: Express) {
  app.get("/api/csrf-token", (req: Request, res: Response) => {
    const token = generateCsrfToken();
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 24 * 60 * 60 * 1000,
    });
    res.json({ token });
  });
}

// ============================================================================
// SECURITY HEADERS
// ============================================================================

export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  
  // Prevent MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");
  
  // Enable XSS filter
  res.setHeader("X-XSS-Protection", "1; mode=block");
  
  // Referrer policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  
  next();
}

// ============================================================================
// COMBINED SETUP FUNCTION
// ============================================================================

export function setupSecurityMiddleware(app: Express) {
  // Trust proxy for accurate IP detection behind load balancers
  app.set("trust proxy", 1);
  
  // Apply security headers to all requests
  app.use(securityHeaders);
  
  // Apply global rate limiting to all API routes
  app.use("/api/", globalRateLimiter);
  
  // Apply stricter rate limiting to auth routes
  app.use("/api/auth/login", authRateLimiter);
  app.use("/api/auth/register", authRateLimiter);
  app.use("/api/auth/forgot-password", passwordResetRateLimiter);
  
  // Register CSRF token endpoint
  registerCsrfTokenEndpoint(app);
  
  // Generate CSRF tokens for GET requests
  app.use(csrfTokenGenerator);
  
  // Note: CSRF protection middleware should be added AFTER session middleware
  // and AFTER cookie-parser, so it's applied in routes.ts after session setup
}
