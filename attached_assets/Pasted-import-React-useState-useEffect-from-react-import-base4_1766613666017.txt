import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { 
  Settings, RefreshCcw, ArrowUpDown, CheckCircle, AlertCircle, 
  Clock, Database, Users, Building2, Info
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const FOLK_API_KEY = 'FOLKO44Quv0mawjUvsnPq5oDw6W9ctRr';
const FOLK_API_VERSION = '2025-05-26';

export default function FolkSettings() {
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('All VCs');
  const [syncInterval, setSyncInterval] = useState('manual');
  const [connectionStatus, setConnectionStatus] = useState('unknown');
  const [inspectionResults, setInspectionResults] = useState(null);
  const [syncFields, setSyncFields] = useState({
    contacts: {
      full_name: true,
      first_name: true,
      last_name: true,
      title: true,
      work_email: true,
      personal_email: true,
      primary_phone: true,
      linkedin_url: true,
      twitter_url: true,
      bio: true,
      location: true
    },
    firms: {
      company_name: true,
      website: true,
      linkedin_url: true,
      firm_type: true,
      firm_description: true,
      investment_focus: true,
      investment_stages: true,
      preferred_geography: true,
      check_size_min: true,
      check_size_max: true
    }
  });

  useEffect(() => {
    testConnection();
    loadGroups();
  }, []);

  const testConnection = async () => {
    setLoading(true);
    try {
      const { data: result } = await base44.functions.invoke('folkApi', { action: 'testConnection' });
      
      if (result.success) {
        setConnectionStatus('connected');
        toast.success('Folk CRM connection verified');
      } else {
        setConnectionStatus('error');
        toast.error('Failed to connect to Folk CRM');
      }
    } catch (error) {
      setConnectionStatus('error');
      toast.error(`Connection error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadGroups = async () => {
    try {
      const { data: result } = await base44.functions.invoke('folkApi', { action: 'listGroups' });
      
      if (result.success) {
        setGroups(result.groups || []);
      }
    } catch (error) {
      console.error('Failed to load groups:', error);
    }
  };

  const saveSettings = async () => {
    localStorage.setItem('folkSyncFields', JSON.stringify(syncFields));
    toast.success('Folk sync settings saved');
  };

  const toggleSyncField = (entityType, field) => {
    setSyncFields(prev => ({
      ...prev,
      [entityType]: {
        ...prev[entityType],
        [field]: !prev[entityType][field]
      }
    }));
  };

  useEffect(() => {
    const savedFields = localStorage.getItem('folkSyncFields');
    if (savedFields) {
      setSyncFields(JSON.parse(savedFields));
    }
  }, []);

  const inspectGroupFields = async () => {
    if (!selectedGroup) {
      toast.error('Please select a group first');
      return;
    }

    setLoading(true);
    try {
      const { data: result } = await base44.functions.invoke('folkApi', { 
        action: 'inspectGroupFields',
        groupName: selectedGroup 
      });

      if (result.success) {
        setInspectionResults(result);
        toast.success('Fields loaded successfully');
      }
    } catch (error) {
      console.error('Inspection error:', error);
      toast.error(`Failed to inspect: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Folk CRM Connection
          </CardTitle>
          <CardDescription>
            Manage your Folk CRM integration settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${
                connectionStatus === 'connected' ? 'bg-emerald-500' : 
                connectionStatus === 'error' ? 'bg-red-500' : 
                'bg-slate-400'
              }`} />
              <div>
                <p className="font-medium text-slate-900">
                  {connectionStatus === 'connected' ? 'Connected' : 
                   connectionStatus === 'error' ? 'Connection Error' : 
                   'Testing Connection...'}
                </p>
                <p className="text-sm text-slate-500">
                  API Version: {FOLK_API_VERSION}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={testConnection}
                disabled={loading}
              >
                <RefreshCcw className="w-4 h-4 mr-2" />
                Test
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={inspectGroupFields}
                disabled={loading || !selectedGroup}
              >
                <Database className="w-4 h-4 mr-2" />
                Inspect Fields
              </Button>
            </div>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Admin Access Only</AlertTitle>
            <AlertDescription>
              This integration uses a workspace-level API key with admin access. 
              All synced data will be available to users based on their permissions.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Sync Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Sync Configuration</CardTitle>
          <CardDescription>
            Configure which Folk group to sync and how often
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Folk Group to Sync</Label>
            <Select value={selectedGroup} onValueChange={setSelectedGroup}>
              <SelectTrigger>
                <SelectValue placeholder="Select a group" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.name}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">
              Only contacts and companies in this group will be synced
            </p>
          </div>

          <div className="space-y-2">
            <Label>Sync Frequency</Label>
            <Select value={syncInterval} onValueChange={setSyncInterval}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual Only</SelectItem>
                <SelectItem value="hourly">Every Hour</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">
              Automatic sync is currently not implemented - use manual sync
            </p>
          </div>

          <div className="flex justify-end pt-4 border-t">
            <Button onClick={saveSettings}>
              Save Settings
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* API Information */}
      <Card>
        <CardHeader>
          <CardTitle>API Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">Base URL:</span>
            <span className="font-mono text-slate-900">https://api.folk.app</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">API Version:</span>
            <span className="font-mono text-slate-900">{FOLK_API_VERSION}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">Selected Group:</span>
            <Badge variant="secondary">{selectedGroup}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Field Inspection Results */}
      {inspectionResults && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Folk Group Fields
            </CardTitle>
            <CardDescription>
              Columns available in "{selectedGroup}" group
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Company Fields */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="w-4 h-4 text-indigo-600" />
                <h3 className="font-semibold text-slate-900">Company/Firm Fields</h3>
                <Badge variant="secondary">{inspectionResults.companyFields.length} fields</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {inspectionResults.companyFields.map((field) => (
                  <Badge key={field} variant="outline" className="font-mono text-xs">
                    {field}
                  </Badge>
                ))}
              </div>
            </div>

            {/* People Fields */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-emerald-600" />
                <h3 className="font-semibold text-slate-900">Contact/People Fields</h3>
                <Badge variant="secondary">{inspectionResults.peopleFields.length} fields</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {inspectionResults.peopleFields.map((field) => (
                  <Badge key={field} variant="outline" className="font-mono text-xs">
                    {field}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Sample Data */}
            <div className="pt-4 border-t">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  console.log('Sample Companies:', inspectionResults.sampleCompanies);
                  console.log('Sample People:', inspectionResults.samplePeople);
                  toast.success('Sample data logged to console');
                }}
              >
                View Sample Data in Console
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Field Sync Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Bidirectional Field Sync</CardTitle>
          <CardDescription>
            Configure which fields sync between your app and Folk CRM
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="contacts">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="contacts">Contact Fields</TabsTrigger>
              <TabsTrigger value="firms">Firm Fields</TabsTrigger>
            </TabsList>
            
            <TabsContent value="contacts" className="space-y-4 mt-4">
              <p className="text-sm text-slate-600 mb-4">
                Select which contact fields should sync bidirectionally with Folk CRM
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Object.entries(syncFields.contacts).map(([field, enabled]) => (
                  <div key={field} className="flex items-center space-x-2 p-2 border rounded hover:bg-slate-50">
                    <Checkbox
                      id={`contact-${field}`}
                      checked={enabled}
                      onCheckedChange={() => toggleSyncField('contacts', field)}
                    />
                    <label
                      htmlFor={`contact-${field}`}
                      className="text-sm font-medium leading-none cursor-pointer"
                    >
                      {field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </label>
                  </div>
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="firms" className="space-y-4 mt-4">
              <p className="text-sm text-slate-600 mb-4">
                Select which firm fields should sync bidirectionally with Folk CRM
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Object.entries(syncFields.firms).map(([field, enabled]) => (
                  <div key={field} className="flex items-center space-x-2 p-2 border rounded hover:bg-slate-50">
                    <Checkbox
                      id={`firm-${field}`}
                      checked={enabled}
                      onCheckedChange={() => toggleSyncField('firms', field)}
                    />
                    <label
                      htmlFor={`firm-${field}`}
                      className="text-sm font-medium leading-none cursor-pointer"
                    >
                      {field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </label>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
          
          <div className="flex justify-end mt-6 pt-4 border-t">
            <Button onClick={saveSettings}>
              Save Sync Configuration
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}