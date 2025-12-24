import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";

// Register auth-specific routes
export function registerAuthRoutes(app: Express): void {
  // Get current authenticated user (returns null if not authenticated)
  app.get("/api/auth/user", async (req: any, res) => {
    try {
      // Check if user is authenticated
      if (!req.isAuthenticated || !req.isAuthenticated() || !req.user?.claims?.sub) {
        return res.json(null);
      }
      
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Update current user profile (for onboarding and profile updates)
  app.patch("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const updateData: Record<string, any> = {};
      
      // Map request body to database fields
      const allowedFields = [
        'firstName', 'lastName', 'userType', 'companyName', 'jobTitle',
        'linkedinUrl', 'phone', 'bio', 'industries', 'stage', 
        'preferredStages', 'firmRole', 'checkSizeMin', 'checkSizeMax',
        'investmentFocus', 'location'
      ];
      
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      }
      
      // Handle onboarding completion
      if (req.body.onboardingCompleted) {
        updateData.onboardingCompleted = new Date();
      }
      
      const user = await authStorage.updateUser(userId, updateData);
      res.json(user);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });
}
