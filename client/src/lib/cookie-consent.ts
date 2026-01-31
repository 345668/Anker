export interface CookiePreferences {
  necessary: boolean;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
  consentGiven: boolean;
  consentDate: string | null;
  consentVersion: string;
}

export const CONSENT_VERSION = "1.0";

export const defaultPreferences: CookiePreferences = {
  necessary: true,
  functional: false,
  analytics: false,
  marketing: false,
  consentGiven: false,
  consentDate: null,
  consentVersion: CONSENT_VERSION,
};

const STORAGE_KEY = "cookie_preferences";

export function getCookiePreferences(): CookiePreferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const prefs = JSON.parse(stored) as CookiePreferences;
      if (prefs.consentVersion !== CONSENT_VERSION) {
        return defaultPreferences;
      }
      return prefs;
    }
  } catch (e) {
    console.error("Error reading cookie preferences:", e);
  }
  return defaultPreferences;
}

export function saveCookiePreferences(preferences: CookiePreferences): void {
  try {
    const prefsToSave: CookiePreferences = {
      ...preferences,
      necessary: true,
      consentGiven: true,
      consentDate: new Date().toISOString(),
      consentVersion: CONSENT_VERSION,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefsToSave));
  } catch (e) {
    console.error("Error saving cookie preferences:", e);
  }
}

export function acceptAllCookies(): void {
  saveCookiePreferences({
    necessary: true,
    functional: true,
    analytics: true,
    marketing: true,
    consentGiven: true,
    consentDate: new Date().toISOString(),
    consentVersion: CONSENT_VERSION,
  });
}

export function denyAllCookies(): void {
  saveCookiePreferences({
    necessary: true,
    functional: false,
    analytics: false,
    marketing: false,
    consentGiven: true,
    consentDate: new Date().toISOString(),
    consentVersion: CONSENT_VERSION,
  });
}

export function hasConsentBeenGiven(): boolean {
  const prefs = getCookiePreferences();
  return prefs.consentGiven && prefs.consentVersion === CONSENT_VERSION;
}

export function resetCookieConsent(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export const cookieCategories = [
  {
    id: "necessary",
    name: "Strictly Necessary",
    description: "Essential cookies for the website to function properly. These cannot be disabled.",
    required: true,
  },
  {
    id: "functional",
    name: "Functional",
    description: "Enable personalized features like remembering your preferences and settings.",
    required: false,
  },
  {
    id: "analytics",
    name: "Analytics",
    description: "Help us understand how visitors interact with our website to improve the user experience.",
    required: false,
  },
  {
    id: "marketing",
    name: "Marketing",
    description: "Used to deliver personalized advertisements and track advertising campaign performance.",
    required: false,
  },
] as const;
