import { motion } from "framer-motion";
import NewsCard from '@/framer/news-card';
import NewsroomGrid from '@/framer/newsroom-grid';
import NewsroomFilters from '@/framer/newsroom-filters';

// Dummy data for news items
const newsItems = [
  {
    title: "The State of DeFi in 2024",
    date: "Oct 15, 2024",
    category: "Insights",
    slug: "/news/state-of-defi"
  },
  {
    title: "Why We Invested in LayerZero",
    date: "Sep 28, 2024",
    category: "Portfolio",
    slug: "/news/layerzero-investment"
  },
  {
    title: "Introducing Anker Fund II",
    date: "Aug 12, 2024",
    category: "Announcements",
    slug: "/news/fund-ii"
  }
];

export default function Newsroom() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen pt-24 pb-24"
    >
      <div className="container mx-auto px-4">
        <div className="mb-16">
          <h1 className="text-5xl font-bold mb-6">Newsroom</h1>
          <p className="text-xl text-muted-foreground max-w-2xl">
            Latest updates, insights, and announcements from the Anker team and our portfolio companies.
          </p>
        </div>

        <div className="mb-12">
          {/* Framer Filter Component */}
          <NewsroomFilters.Responsive />
        </div>

        {/* Since we can't easily map data into NewsroomGrid if it doesn't accept a data prop, 
            we'll build a custom grid using the NewsCard Item */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {newsItems.map((item, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              {/* Using the Framer News Card with our data */}
              <NewsCard.Responsive 
                DoELK3oP8={item.title}
                KbXUsFj2Y={item.date}
                eW_riBZ21={item.category}
                txGDSPAmo={item.slug}
                className="w-full h-full"
              />
            </motion.div>
          ))}
          
          {/* Add more placeholder items if needed */}
          <NewsCard.Responsive 
            DoELK3oP8="Understanding Zero Knowledge Proofs"
            KbXUsFj2Y="July 05, 2024"
            eW_riBZ21="Technical"
            txGDSPAmo="#"
          />
           <NewsCard.Responsive 
            DoELK3oP8="Anker Annual Summit Recap"
            KbXUsFj2Y="June 20, 2024"
            eW_riBZ21="Events"
            txGDSPAmo="#"
          />
        </div>
      </div>
    </motion.div>
  );
}
