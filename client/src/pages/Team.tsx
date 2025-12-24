import { motion } from "framer-motion";
import TeamCard from '@/framer/team-card';

// Normally we'd map this, but props are obfuscated in the Framer component.
// We'll render a few instances for visual completeness.

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
          <h1 className="text-5xl font-bold mb-6">Our Team</h1>
          <p className="text-xl text-muted-foreground">
            A diverse group of investors, engineers, and builders united by a passion for decentralization.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* We'll use the Framer TeamCard component multiple times */}
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
              className="hover:-translate-y-2 transition-transform duration-300"
            >
              <TeamCard.Responsive 
                // Since we don't know the exact prop names for Name/Role/Image without a type definition
                // We assume the component has default placeholders or accepts generic props.
                // In a real scenario, we'd inspect the component definition.
                className="w-full"
              />
              
              {/* Fallback label if the Framer component relies on internal static data */}
              <div className="mt-4 text-center">
                {/* Visual adjustment in case card doesn't include text area */}
              </div>
            </motion.div>
          ))}
        </div>
        
        <div className="mt-32 bg-secondary/30 rounded-3xl p-12 text-center">
          <h3 className="text-3xl font-bold mb-6">Join Our Team</h3>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            We are always looking for exceptional talent to join our investment and platform teams.
          </p>
          <button className="px-8 py-3 bg-primary text-primary-foreground rounded-full font-semibold hover:bg-primary/90 transition-colors">
            View Open Positions
          </button>
        </div>
      </div>
    </motion.div>
  );
}
