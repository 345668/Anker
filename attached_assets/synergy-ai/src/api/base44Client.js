import { createClient } from '@base44/sdk';
// import { getAccessToken } from '@base44/sdk/utils/auth-utils';

// Create a client with authentication required
export const base44 = createClient({
  appId: "69285567039f33f9c7d8756f", 
  requiresAuth: true // Ensure authentication is required for all operations
});
