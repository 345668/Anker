import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { 
  Settings as SettingsIcon, Bell, Mail, Shield, Loader2, Save, Check
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";

export default function Settings() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notifications, setNotifications] = useState({
    email_opens: true,
    replies: true,
    new_matches: true,
    weekly_digest: true,
  });

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await base44.auth.me();
        setUser(userData);
        if (userData.notification_preferences) {
          setNotifications(userData.notification_preferences);
        }
      } catch (e) {
        console.error('Error loading user:', e);
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.auth.updateMe({ notification_preferences: notifications });
      toast.success('Settings saved');
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 mt-1">Manage your preferences and notifications</p>
      </div>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-slate-500" />
            <CardTitle>Notifications</CardTitle>
          </div>
          <CardDescription>Choose what you want to be notified about</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Email Opens</Label>
              <p className="text-sm text-slate-500">Get notified when investors open your emails</p>
            </div>
            <Switch
              checked={notifications.email_opens}
              onCheckedChange={(checked) => setNotifications({ ...notifications, email_opens: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Replies</Label>
              <p className="text-sm text-slate-500">Get notified when investors reply to your outreach</p>
            </div>
            <Switch
              checked={notifications.replies}
              onCheckedChange={(checked) => setNotifications({ ...notifications, replies: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">New Matches</Label>
              <p className="text-sm text-slate-500">Get notified when new investor matches are found</p>
            </div>
            <Switch
              checked={notifications.new_matches}
              onCheckedChange={(checked) => setNotifications({ ...notifications, new_matches: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Weekly Digest</Label>
              <p className="text-sm text-slate-500">Receive a weekly summary of your fundraising activity</p>
            </div>
            <Switch
              checked={notifications.weekly_digest}
              onCheckedChange={(checked) => setNotifications({ ...notifications, weekly_digest: checked })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Email Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-slate-500" />
            <CardTitle>Email Integration</CardTitle>
          </div>
          <CardDescription>Connect your email to send outreach directly from the platform</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-6 bg-slate-50 rounded-lg text-center">
            <Mail className="w-10 h-10 text-slate-400 mx-auto mb-3" />
            <p className="text-slate-600 mb-4">Email integration coming soon</p>
            <Button variant="outline" disabled>
              Connect Gmail
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-slate-500" />
            <CardTitle>Security</CardTitle>
          </div>
          <CardDescription>Manage your account security settings</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
              <div>
                <p className="font-medium text-slate-900">Two-Factor Authentication</p>
                <p className="text-sm text-slate-500">Add an extra layer of security</p>
              </div>
              <Button variant="outline" disabled>Coming Soon</Button>
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
              <div>
                <p className="font-medium text-slate-900">Active Sessions</p>
                <p className="text-sm text-slate-500">Manage your logged-in devices</p>
              </div>
              <Button variant="outline" disabled>View Sessions</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex justify-end">
        <Button 
          onClick={handleSave} 
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save Settings
        </Button>
      </div>
    </div>
  );
}