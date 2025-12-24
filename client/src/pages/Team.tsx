import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";

// Import Framer component
import TeamCard from '@/framer/team-card';
import OpenPosition from '@/framer/open-position';

// Team data from CSV
const teamMembers = [
  {
    slug: "emily-wilson",
    name: "Emily Wilson",
    position: "Managing Partner",
    headshot: "https://framerusercontent.com/images/V9L0OiiTBWevgOY7tK4HfRECaY.jpg",
  },
  {
    slug: "alex-harrison",
    name: "Alex Harrison",
    position: "Partner",
    headshot: "https://framerusercontent.com/images/1vZgYMKCk5JZ6UzVmWrvnmhiJc.jpg",
  },
  {
    slug: "elizabeth-green",
    name: "Elizabeth Green",
    position: "Venture Partner",
    headshot: "https://framerusercontent.com/images/OndI3quMEpsGPfWrKjjAFuyRai4.jpg",
  },
  {
    slug: "ryan-jenkins",
    name: "Ryan Jenkins",
    position: "Principal",
    headshot: "https://framerusercontent.com/images/m4Wf80qlzZfjWoTVfwlxJDr0SM.jpg",
  },
  {
    slug: "matthew-sullivan",
    name: "Matthew Sullivan",
    position: "Associate",
    headshot: "https://framerusercontent.com/images/OjRZwqubMLMpZawHFBAFqfXk.jpg",
  },
  {
    slug: "christopher-martin",
    name: "Christopher Martin",
    position: "Investment Analyst",
    headshot: "https://framerusercontent.com/images/WZ8Qk7sSHkxsUILT0QvC1pnQnw.jpg",
  },
];

// Careers data from CSV
const careers = [
  { slug: "investment-analyst", title: "Investment Analyst", location: "San Francisco, CA" },
  { slug: "portfolio-manager", title: "Portfolio Manager", location: "New York, NY" },
  { slug: "startup-scout", title: "Startup Scout", location: "Berlin, Germany" },
  { slug: "business-development-associate", title: "Business Development Associate", location: "London, UK" },
  { slug: "financial-modeling-specialist", title: "Financial Modeling Specialist", location: "Singapore" },
  { slug: "growth-strategy-consultant", title: "Growth Strategy Consultant", location: "Shanghai, China" },
];

export default function Team() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen pt-24 pb-24"
    >
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-20">
          <h1 className="text-5xl font-bold mb-6" data-testid="text-team-title">Our Team</h1>
          <p className="text-xl text-muted-foreground">
            A diverse group of investors, engineers, and builders united by a passion for innovation.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {teamMembers.map((member, i) => (
            <motion.div
              key={member.slug}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              data-testid={`card-team-${member.slug}`}
            >
              <TeamCard
                name={member.name}
                position={member.position}
                image={{ src: member.headshot, alt: member.name }}
                style={{ width: '100%', height: 'auto' }}
              />
            </motion.div>
          ))}
        </div>
        
        {/* Careers Section */}
        <div className="mt-32">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4" data-testid="text-careers-title">Join Our Team</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              We are always looking for exceptional talent to join our investment and platform teams.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {careers.map((job, idx) => (
              <motion.div
                key={job.slug}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
              >
                <Card 
                  className="p-6 hover:border-primary/50 transition-colors cursor-pointer group"
                  data-testid={`card-job-${job.slug}`}
                >
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <h3 className="font-bold mb-1 group-hover:text-primary transition-colors">{job.title}</h3>
                      <p className="text-muted-foreground text-sm">{job.location}</p>
                    </div>
                    <ExternalLink className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Button variant="outline" size="lg" className="rounded-full" data-testid="button-view-all-jobs">
              View All Open Positions
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
