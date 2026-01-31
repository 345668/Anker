import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Shield, Settings, X } from "lucide-react";
import {
  getCookiePreferences,
  saveCookiePreferences,
  acceptAllCookies,
  denyAllCookies,
  hasConsentBeenGiven,
  cookieCategories,
  CookiePreferences,
  CONSENT_VERSION,
} from "@/lib/cookie-consent";

export function CookieConsentBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>({
    necessary: true,
    functional: false,
    analytics: false,
    marketing: false,
    consentGiven: false,
    consentDate: null,
    consentVersion: CONSENT_VERSION,
  });

  useEffect(() => {
    const hasConsent = hasConsentBeenGiven();
    if (!hasConsent) {
      const timer = setTimeout(() => setShowBanner(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAcceptAll = () => {
    acceptAllCookies();
    setShowBanner(false);
    setShowDetails(false);
  };

  const handleDenyAll = () => {
    denyAllCookies();
    setShowBanner(false);
    setShowDetails(false);
  };

  const handleSavePreferences = () => {
    saveCookiePreferences(preferences);
    setShowBanner(false);
    setShowDetails(false);
  };

  const handleToggleCategory = (categoryId: string, enabled: boolean) => {
    setPreferences(prev => ({
      ...prev,
      [categoryId]: enabled,
    }));
  };

  if (!showBanner) return null;

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-end justify-center p-4 bg-black/50 backdrop-blur-sm"
      data-testid="cookie-consent-overlay"
    >
      <Card className="w-full max-w-2xl shadow-xl animate-in slide-in-from-bottom-4 duration-300">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Cookie Preferences</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDenyAll}
              data-testid="button-close-cookie-banner"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription className="text-sm">
            We use cookies to enhance your experience. In accordance with GDPR (EU), CCPA (US), 
            and PIPEDA (Canada), you can choose which cookies to accept. Necessary cookies are 
            required for the website to function and cannot be disabled.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {showDetails && (
            <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
              {cookieCategories.map((category) => (
                <div
                  key={category.id}
                  className="flex items-start justify-between gap-4"
                  data-testid={`cookie-category-${category.id}`}
                >
                  <div className="flex-1 space-y-1">
                    <Label 
                      htmlFor={`cookie-${category.id}`}
                      className="font-medium text-sm"
                    >
                      {category.name}
                      {category.required && (
                        <span className="ml-2 text-xs text-muted-foreground">(Required)</span>
                      )}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {category.description}
                    </p>
                  </div>
                  <Switch
                    id={`cookie-${category.id}`}
                    checked={category.required || preferences[category.id as keyof CookiePreferences] as boolean}
                    onCheckedChange={(checked) => handleToggleCategory(category.id, checked)}
                    disabled={category.required}
                    data-testid={`switch-cookie-${category.id}`}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            {!showDetails ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setShowDetails(true)}
                  className="flex-1 gap-2"
                  data-testid="button-customize-cookies"
                >
                  <Settings className="h-4 w-4" />
                  Customize
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDenyAll}
                  className="flex-1"
                  data-testid="button-deny-cookies"
                >
                  Deny All
                </Button>
                <Button
                  onClick={handleAcceptAll}
                  className="flex-1"
                  data-testid="button-accept-cookies"
                >
                  Accept All
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setShowDetails(false)}
                  className="flex-1"
                  data-testid="button-back-cookies"
                >
                  Back
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDenyAll}
                  className="flex-1"
                  data-testid="button-deny-all-cookies"
                >
                  Deny All
                </Button>
                <Button
                  onClick={handleSavePreferences}
                  className="flex-1"
                  data-testid="button-save-cookie-preferences"
                >
                  Save Preferences
                </Button>
              </>
            )}
          </div>

          <p className="text-xs text-center text-muted-foreground">
            By continuing to use this site, you agree to our{" "}
            <a href="/privacy" className="underline hover:text-primary">Privacy Policy</a>
            {" "}and{" "}
            <a href="/terms" className="underline hover:text-primary">Terms of Service</a>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
