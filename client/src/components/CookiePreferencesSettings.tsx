import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Shield, Check, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  getCookiePreferences,
  saveCookiePreferences,
  resetCookieConsent,
  cookieCategories,
  CookiePreferences,
  CONSENT_VERSION,
} from "@/lib/cookie-consent";

export function CookiePreferencesSettings() {
  const { toast } = useToast();
  const [preferences, setPreferences] = useState<CookiePreferences>(getCookiePreferences());
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setPreferences(getCookiePreferences());
  }, []);

  const handleToggleCategory = (categoryId: string, enabled: boolean) => {
    setPreferences(prev => ({
      ...prev,
      [categoryId]: enabled,
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    saveCookiePreferences(preferences);
    setHasChanges(false);
    toast({
      title: "Preferences saved",
      description: "Your cookie preferences have been updated.",
    });
  };

  const handleReset = () => {
    resetCookieConsent();
    setPreferences({
      necessary: true,
      functional: false,
      analytics: false,
      marketing: false,
      consentGiven: false,
      consentDate: null,
      consentVersion: CONSENT_VERSION,
    });
    setHasChanges(true);
    toast({
      title: "Preferences reset",
      description: "Your cookie preferences have been reset. Save to apply changes.",
    });
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Not set";
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "Invalid date";
    }
  };

  return (
    <Card data-testid="card-cookie-preferences">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <CardTitle>Cookie Preferences</CardTitle>
        </div>
        <CardDescription>
          Manage your cookie preferences in accordance with GDPR (EU), CCPA (US), and PIPEDA (Canada) regulations.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {preferences.consentGiven && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-sm">
            <Info className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              Consent given on: {formatDate(preferences.consentDate)}
            </span>
          </div>
        )}

        <div className="space-y-4">
          {cookieCategories.map((category) => (
            <div
              key={category.id}
              className="flex items-start justify-between gap-4 p-4 rounded-lg border"
              data-testid={`settings-cookie-category-${category.id}`}
            >
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <Label 
                    htmlFor={`settings-cookie-${category.id}`}
                    className="font-medium"
                  >
                    {category.name}
                  </Label>
                  {category.required && (
                    <Badge variant="secondary" className="text-xs">Required</Badge>
                  )}
                  {preferences[category.id as keyof CookiePreferences] && !category.required && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <Check className="h-3 w-3" /> Enabled
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {category.description}
                </p>
              </div>
              <Switch
                id={`settings-cookie-${category.id}`}
                checked={category.required || preferences[category.id as keyof CookiePreferences] as boolean}
                onCheckedChange={(checked) => handleToggleCategory(category.id, checked)}
                disabled={category.required}
                data-testid={`settings-switch-cookie-${category.id}`}
              />
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleReset}
            data-testid="button-reset-cookie-preferences"
          >
            Reset to Default
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges}
            className="sm:ml-auto"
            data-testid="button-save-settings-cookie-preferences"
          >
            Save Preferences
          </Button>
        </div>

        <div className="text-xs text-muted-foreground space-y-1 pt-2">
          <p><strong>Your Rights:</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>EU (GDPR):</strong> Right to access, rectify, erase, and port your data</li>
            <li><strong>US (CCPA):</strong> Right to know, delete, and opt-out of data sales</li>
            <li><strong>Canada (PIPEDA):</strong> Right to access and challenge your personal information</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
