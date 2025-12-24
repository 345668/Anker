import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { X } from 'lucide-react';

const industries = ['SaaS', 'FinTech', 'HealthTech', 'AI/ML', 'E-commerce', 'B2B', 'Consumer', 'Enterprise', 'CleanTech', 'EdTech'];
const stages = ['Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C+'];
const geographies = ['North America', 'Europe', 'Asia', 'Latin America', 'Middle East', 'Africa'];

export default function OnboardingProfile({ onComplete, user }) {
  const [profile, setProfile] = useState({
    investment_focus: [],
    investment_stages: [],
    preferred_geography: [],
    check_size_min: '',
    check_size_max: '',
    industry_experience: '',
    investment_criteria: ''
  });

  const toggleItem = (field, item) => {
    setProfile(prev => ({
      ...prev,
      [field]: prev[field].includes(item)
        ? prev[field].filter(i => i !== item)
        : [...prev[field], item]
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onComplete(profile);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Build Your Investment Profile</CardTitle>
        <CardDescription>
          Help us understand your investment preferences to provide personalized recommendations
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Investment Focus */}
          <div>
            <Label className="mb-3 block">Investment Focus (Select multiple)</Label>
            <div className="flex flex-wrap gap-2">
              {industries.map(industry => (
                <Badge
                  key={industry}
                  variant={profile.investment_focus.includes(industry) ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => toggleItem('investment_focus', industry)}
                >
                  {industry}
                  {profile.investment_focus.includes(industry) && (
                    <X className="w-3 h-3 ml-1" />
                  )}
                </Badge>
              ))}
            </div>
          </div>

          {/* Investment Stages */}
          <div>
            <Label className="mb-3 block">Preferred Investment Stages</Label>
            <div className="flex flex-wrap gap-2">
              {stages.map(stage => (
                <Badge
                  key={stage}
                  variant={profile.investment_stages.includes(stage) ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => toggleItem('investment_stages', stage)}
                >
                  {stage}
                  {profile.investment_stages.includes(stage) && (
                    <X className="w-3 h-3 ml-1" />
                  )}
                </Badge>
              ))}
            </div>
          </div>

          {/* Geography */}
          <div>
            <Label className="mb-3 block">Preferred Geography</Label>
            <div className="flex flex-wrap gap-2">
              {geographies.map(geo => (
                <Badge
                  key={geo}
                  variant={profile.preferred_geography.includes(geo) ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => toggleItem('preferred_geography', geo)}
                >
                  {geo}
                  {profile.preferred_geography.includes(geo) && (
                    <X className="w-3 h-3 ml-1" />
                  )}
                </Badge>
              ))}
            </div>
          </div>

          {/* Check Size */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Minimum Check Size ($)</Label>
              <Input
                type="number"
                value={profile.check_size_min}
                onChange={(e) => setProfile({ ...profile, check_size_min: e.target.value })}
                placeholder="50000"
              />
            </div>
            <div>
              <Label>Maximum Check Size ($)</Label>
              <Input
                type="number"
                value={profile.check_size_max}
                onChange={(e) => setProfile({ ...profile, check_size_max: e.target.value })}
                placeholder="500000"
              />
            </div>
          </div>

          {/* Industry Experience */}
          <div>
            <Label>Your Industry Experience</Label>
            <Textarea
              value={profile.industry_experience}
              onChange={(e) => setProfile({ ...profile, industry_experience: e.target.value })}
              placeholder="Describe your background and areas of expertise..."
              rows={3}
            />
          </div>

          {/* Investment Criteria */}
          <div>
            <Label>Key Investment Criteria</Label>
            <Textarea
              value={profile.investment_criteria}
              onChange={(e) => setProfile({ ...profile, investment_criteria: e.target.value })}
              placeholder="What do you look for in startups? (team, traction, market size, etc.)"
              rows={3}
            />
          </div>

          <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700">
            Generate Recommendations
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}