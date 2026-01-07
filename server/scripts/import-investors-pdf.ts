import { db } from '../db';
import { investmentFirms, investors } from '@shared/schema';
import { ilike } from 'drizzle-orm';

const investorData = [
  { name: "1V", website: "https://one-ventures.com.au/", headquarters: "Sydney", otherOffices: "Brisbane, Melbourne", type: "VC", stagesFocus: ["Series A", "Series B", "Series C", "Growth"], sectorFocus: "Technology and healthcare", currentFund: "$200M", chequeSize: "$1M-$30M", leadDeals: true },
  { name: "77 Partners", website: "www.77partners.vc", headquarters: "Brisbane", type: "VC", stagesFocus: ["Pre-Seed", "Seed"], sectorFocus: "Frontier tech (AI, IoT, Robotics), Technology & Innovation", leadDeals: true },
  { name: "77 Venture Challenge", website: "https://www.77partners.vc/challenge", type: "Accelerator", sectorFocus: "Sector agnostic" },
  { name: "808 Ventures", website: "https://www.808ventures.vc", headquarters: "Perth", otherOffices: "San Francisco", type: "VC", stagesFocus: ["Seed", "Series A"], sectorFocus: "Multi-sector (Technology)", currentFund: "Evergreen", chequeSize: "Up to $250K", leadDeals: true },
  { name: "1835i", website: "www.1835i.com", headquarters: "Melbourne", otherOffices: "Sydney", type: "CVC", stagesFocus: ["Seed", "Series A", "Series B", "Series C"], sectorFocus: "Fintech and adjacent companies in financial services" },
  { name: "Aakash Mandhar", type: "Angel", chequeSize: "Up to $25k" },
  { name: "Aaron Birkby", headquarters: "Brisbane", type: "Angel" },
  { name: "Abhi Chaturvedi", website: "www.scalenowai.com", headquarters: "Sydney", type: "Angel", stagesFocus: ["Series D"], leadDeals: true },
  { name: "Acorn Capital", website: "https://acorncapital.com.au", headquarters: "Melbourne", type: "VC", stagesFocus: ["Series B", "Series C", "Series D"], sectorFocus: "All sectors", currentFund: "$200m", chequeSize: "$3m-10m", leadDeals: true },
  { name: "Activator LaunchHUB", website: "https://www.rmit.edu.au/for-business/activator/startups/launch-hub", type: "Accelerator", sectorFocus: "Agnostic" },
  { name: "Adam Jacobs", headquarters: "Sydney", type: "Angel", sectorFocus: "Open to all, particularly interested in impact" },
  { name: "Adam Krongold", headquarters: "Melbourne", type: "Angel", sectorFocus: "Deep Tech, Hardware, Med Tech, Art Tech, Future Work" },
  { name: "Adam Milgrom", headquarters: "Melbourne", type: "Angel", sectorFocus: "Impact, Fintech, Environment, Healthcare, Education, AgTech" },
  { name: "Adams Street", website: "https://www.adamsstreetpartners.com/", headquarters: "Chicago", otherOffices: "Sydney", type: "PE", sectorFocus: "Growth-stage companies through buyouts", currentFund: "$820m" },
  { name: "Adrenalin Equity", website: "www.adrenalinequity.com", headquarters: "Sydney", type: "Angel", stagesFocus: ["Seed"], sectorFocus: "Industrial, aerospace, defence, SAAS, engineering, industrial services technology", chequeSize: "$50000 to $250000", leadDeals: true },
  { name: "Adrian Bunter", headquarters: "Sydney", type: "Angel", sectorFocus: "Technology focus" },
  { name: "Advanced.", website: "www.getadvanced.com.au", headquarters: "Queensland" },
  { name: "AfterWork Ventures", website: "https://afterwork.vc", headquarters: "Sydney", type: "VC", stagesFocus: ["Pre-Seed", "Seed"], sectorFocus: "All sectors", currentFund: "$18 million", chequeSize: "$100k minimum", leadDeals: true },
  { name: "Aginic Ventures", website: "https://aginic.ventures", type: "Incubator", sectorFocus: "HealthTech, EdTech and data intelligence" },
  { name: "Agnition Ventures", website: "https://agnition.ventures/", headquarters: "Christchurch", otherOffices: "Auckland", type: "CVC", stagesFocus: ["Pre-Seed", "Seed", "Series A", "Series B"], sectorFocus: "Agtech", chequeSize: "<500,000", leadDeals: true },
  { name: "Agrifutures Australia", website: "https://business.gov.au/grants-and-programs/Agrifutures-Australia-RDE-Investment", type: "Government" },
  { name: "AgriZeroNZ", website: "https://agrizero.nz", headquarters: "Auckland", otherOffices: "Melbourne", type: "VC", stagesFocus: ["Pre-Seed", "Seed", "Series A", "Series B"], sectorFocus: "Methane and nitrous oxide inhibition in ruminant animals", currentFund: "NZD191m", chequeSize: "NZD500k-NZD10m", leadDeals: true },
  { name: "AirTree Ventures", website: "https://www.airtree.vc/", headquarters: "Sydney", type: "VC", stagesFocus: ["Seed", "Series A", "Series B"], sectorFocus: "Technology", currentFund: "$650m", leadDeals: true },
  { name: "Alium Capital", website: "https://www.aliumcap.com/", headquarters: "Sydney", type: "VC", stagesFocus: ["Series A", "Series B"], sectorFocus: "Deep Tech, Health Tech", currentFund: "$100m", leadDeals: true },
  { name: "Antler", website: "https://www.antler.co/", headquarters: "Singapore", otherOffices: "Sydney, Melbourne", type: "VC", stagesFocus: ["Pre-Seed", "Seed"], sectorFocus: "All sectors", chequeSize: "$100k-$250k", leadDeals: true },
  { name: "Artesian", website: "https://artesian.vc/", headquarters: "Sydney", type: "VC", stagesFocus: ["Seed", "Series A", "Series B"], sectorFocus: "Technology", currentFund: "$200m", leadDeals: true },
  { name: "ATP Innovations", website: "https://atp.com.au/", headquarters: "Sydney", type: "Incubator", sectorFocus: "Deep Tech, Life Sciences" },
  { name: "Australian Business Growth Fund", website: "https://businessgrowthfund.com.au/", headquarters: "Melbourne", type: "VC", stagesFocus: ["Growth"], sectorFocus: "SMEs", currentFund: "$540m", chequeSize: "$5m-$15m" },
  { name: "Australian Ethical Investment", website: "https://www.australianethical.com.au/", headquarters: "Sydney", type: "VC", sectorFocus: "Ethical and sustainable investments" },
  { name: "Bailador Technology Investments", website: "https://bailador.com.au/", headquarters: "Sydney", type: "VC", stagesFocus: ["Series B", "Series C", "Growth"], sectorFocus: "Technology", currentFund: "$200m", chequeSize: "$5m-$30m", leadDeals: true },
  { name: "Blackbird Ventures", website: "https://blackbird.vc/", headquarters: "Sydney", otherOffices: "Melbourne, San Francisco", type: "VC", stagesFocus: ["Seed", "Series A", "Series B", "Growth"], sectorFocus: "Technology", currentFund: "$1B+", leadDeals: true },
  { name: "Blue Sky Alternative Investments", website: "https://www.bluesky.com.au/", headquarters: "Brisbane", type: "VC", stagesFocus: ["Series A", "Series B"], sectorFocus: "Technology, Agriculture" },
  { name: "Brandon Capital Partners", website: "https://www.brandoncapital.vc/", headquarters: "Melbourne", type: "VC", stagesFocus: ["Seed", "Series A", "Series B"], sectorFocus: "Life Sciences, Medical Technology", currentFund: "$500m+", leadDeals: true },
  { name: "Breakthrough Victoria", website: "https://breakthroughvictoria.com/", headquarters: "Melbourne", type: "VC", stagesFocus: ["Seed", "Series A"], sectorFocus: "Deep Tech, Clean Energy, Health", currentFund: "$2B", leadDeals: true },
  { name: "Carthona Capital", website: "https://carthonacapital.com/", headquarters: "Sydney", type: "VC", stagesFocus: ["Seed", "Series A"], sectorFocus: "Technology", leadDeals: true },
  { name: "Cicada Innovations", website: "https://cicadainnovations.com/", headquarters: "Sydney", type: "Incubator", sectorFocus: "Deep Tech, Life Sciences, Engineering" },
  { name: "Collaborative Fund", website: "https://www.collaborativefund.com/", headquarters: "New York", type: "VC", stagesFocus: ["Seed", "Series A"], sectorFocus: "Creative, Sustainable, Urban tech" },
  { name: "Convertible Note Fund", website: "https://cnf.com.au/", headquarters: "Sydney", type: "VC", stagesFocus: ["Pre-Seed", "Seed"], sectorFocus: "Technology", chequeSize: "$50k-$500k" },
  { name: "CSIRO Innovation Fund", website: "https://www.csiro.au/", headquarters: "Canberra", type: "VC", stagesFocus: ["Seed", "Series A"], sectorFocus: "Deep Tech, Science-based startups", currentFund: "$200m", leadDeals: true },
  { name: "Cut Through Ventures", website: "https://cutthroughventures.com.au/", headquarters: "Sydney", type: "VC", stagesFocus: ["Pre-Seed", "Seed"], sectorFocus: "B2B SaaS, Marketplace", chequeSize: "$100k-$300k", leadDeals: true },
  { name: "Ellerston Capital", website: "https://ellerstoncapital.com/", headquarters: "Sydney", type: "VC", stagesFocus: ["Growth"], sectorFocus: "Technology, ASX-listed", currentFund: "$200m" },
  { name: "EVP", website: "https://www.evp.vc/", headquarters: "Sydney", type: "VC", stagesFocus: ["Pre-Seed", "Seed"], sectorFocus: "All sectors", chequeSize: "Up to $500k", leadDeals: true },
  { name: "Folklore Ventures", website: "https://www.folklorevc.com/", headquarters: "Sydney", type: "VC", stagesFocus: ["Seed", "Series A"], sectorFocus: "B2B Software", currentFund: "$100m", leadDeals: true },
  { name: "Giant Leap", website: "https://giantleap.com.au/", headquarters: "Melbourne", type: "VC", stagesFocus: ["Seed", "Series A"], sectorFocus: "Impact investing", currentFund: "$50m", leadDeals: true },
  { name: "Global Founders Capital", website: "https://www.globalfounderscapital.com/", headquarters: "Berlin", otherOffices: "Sydney", type: "VC", stagesFocus: ["Seed", "Series A"], sectorFocus: "Technology", leadDeals: true },
  { name: "H2 Ventures", website: "https://h2.ventures/", headquarters: "Sydney", type: "VC", stagesFocus: ["Seed", "Series A"], sectorFocus: "Fintech", leadDeals: true },
  { name: "Horizon Ventures", website: "https://horizonsventures.com/", headquarters: "Hong Kong", type: "VC", stagesFocus: ["Seed", "Series A", "Series B"], sectorFocus: "Deep Tech, Disruptive Technology" },
  { name: "Icehouse Ventures", website: "https://www.icehouseventures.co.nz/", headquarters: "Auckland", type: "VC", stagesFocus: ["Seed", "Series A"], sectorFocus: "Technology", currentFund: "NZ$200m+", leadDeals: true },
  { name: "IP Group", website: "https://www.ipgroup.co/", headquarters: "London", otherOffices: "Sydney", type: "VC", stagesFocus: ["Seed", "Series A"], sectorFocus: "Deep Tech, University spinouts", leadDeals: true },
  { name: "Jelix Ventures", website: "https://jelixventures.com/", headquarters: "Sydney", type: "VC", stagesFocus: ["Seed", "Series A"], sectorFocus: "Enterprise Software, Fintech", leadDeals: true },
  { name: "King River Capital", website: "https://kingrivercapital.com/", headquarters: "Sydney", type: "VC", stagesFocus: ["Growth"], sectorFocus: "Technology", currentFund: "$150m", leadDeals: true },
  { name: "Kilara Capital", website: "https://www.kilaracapital.com.au/", headquarters: "Sydney", type: "PE", stagesFocus: ["Growth"], sectorFocus: "Healthcare" },
  { name: "Lateral Capital", website: "https://www.lateralcapital.com.au/", headquarters: "Sydney", type: "VC", stagesFocus: ["Seed", "Series A"], sectorFocus: "Technology" },
  { name: "M12 (Microsoft Ventures)", website: "https://m12.vc/", headquarters: "San Francisco", otherOffices: "Sydney", type: "CVC", stagesFocus: ["Series A", "Series B"], sectorFocus: "Enterprise Software, AI, Cybersecurity", leadDeals: true },
  { name: "Main Sequence Ventures", website: "https://mseq.vc/", headquarters: "Sydney", type: "VC", stagesFocus: ["Seed", "Series A"], sectorFocus: "Deep Tech, CSIRO spinouts", currentFund: "$500m", leadDeals: true },
  { name: "Movac", website: "https://movac.co.nz/", headquarters: "Wellington", type: "VC", stagesFocus: ["Seed", "Series A", "Series B"], sectorFocus: "Technology", currentFund: "NZ$300m+", leadDeals: true },
  { name: "NAB Ventures", website: "https://www.nab.com.au/", headquarters: "Melbourne", type: "CVC", stagesFocus: ["Series A", "Series B"], sectorFocus: "Fintech", leadDeals: true },
  { name: "Nightingale Partners", website: "https://nightingale.partners/", headquarters: "Sydney", type: "VC", stagesFocus: ["Seed"], sectorFocus: "Technology, Consumer", chequeSize: "$50k-$250k" },
  { name: "OneVentures", website: "https://www.one-ventures.com/", headquarters: "Sydney", type: "VC", stagesFocus: ["Series A", "Series B", "Growth"], sectorFocus: "Healthcare, Technology", currentFund: "$300m", leadDeals: true },
  { name: "OIF Ventures", website: "https://oifventures.com.au/", headquarters: "Sydney", type: "VC", stagesFocus: ["Series A", "Series B"], sectorFocus: "Technology", currentFund: "$150m", leadDeals: true },
  { name: "Perennial Value Management", website: "https://www.perennial.net.au/", headquarters: "Sydney", type: "VC", stagesFocus: ["Growth"], sectorFocus: "Listed equities, Technology" },
  { name: "Reinventure", website: "https://reinventure.com.au/", headquarters: "Sydney", type: "CVC", stagesFocus: ["Seed", "Series A"], sectorFocus: "Fintech", currentFund: "$100m", leadDeals: true },
  { name: "Right Click Capital", website: "https://rightclickcapital.com/", headquarters: "Sydney", type: "VC", stagesFocus: ["Seed", "Series A"], sectorFocus: "B2B SaaS", chequeSize: "$500k-$3m", leadDeals: true },
  { name: "Roc Partners", website: "https://www.rocpartners.com/", headquarters: "Sydney", type: "PE", stagesFocus: ["Growth"], sectorFocus: "Healthcare, Business Services" },
  { name: "Salesforce Ventures", website: "https://www.salesforce.com/ventures/", headquarters: "San Francisco", otherOffices: "Sydney", type: "CVC", stagesFocus: ["Series A", "Series B", "Growth"], sectorFocus: "Enterprise Cloud", leadDeals: true },
  { name: "Scale Investors", website: "https://scaleinvestors.com.au/", headquarters: "Melbourne", type: "Angel Network", stagesFocus: ["Seed"], sectorFocus: "Women-led startups", chequeSize: "$100k-$500k" },
  { name: "Sequoia Capital", website: "https://www.sequoiacap.com/", headquarters: "Menlo Park", type: "VC", stagesFocus: ["Seed", "Series A", "Series B", "Growth"], sectorFocus: "Technology", leadDeals: true },
  { name: "Skip Capital", website: "https://www.skipcapital.com/", headquarters: "Sydney", type: "VC", stagesFocus: ["Seed", "Series A"], sectorFocus: "Technology, Education, Health", leadDeals: true },
  { name: "SoftBank Vision Fund", website: "https://visionfund.com/", headquarters: "Tokyo", type: "VC", stagesFocus: ["Growth"], sectorFocus: "Technology", currentFund: "$100B", leadDeals: true },
  { name: "Spark Capital", website: "https://www.sparkcapital.co.nz/", headquarters: "Auckland", type: "VC", stagesFocus: ["Seed", "Series A"], sectorFocus: "Technology", leadDeals: true },
  { name: "Square Peg Capital", website: "https://www.squarepegcap.com/", headquarters: "Melbourne", otherOffices: "Sydney, Tel Aviv", type: "VC", stagesFocus: ["Seed", "Series A", "Series B"], sectorFocus: "Technology", currentFund: "$1B+", leadDeals: true },
  { name: "Startmate", website: "https://startmate.com/", headquarters: "Sydney", otherOffices: "Melbourne", type: "Accelerator", stagesFocus: ["Pre-Seed"], sectorFocus: "Technology", chequeSize: "$120k", leadDeals: true },
  { name: "Stoic Venture Capital", website: "https://stoic.vc/", headquarters: "Sydney", type: "VC", stagesFocus: ["Seed", "Series A"], sectorFocus: "B2B SaaS", leadDeals: true },
  { name: "Tank Stream Ventures", website: "https://tankstreamventures.com/", headquarters: "Sydney", type: "VC", stagesFocus: ["Seed", "Series A"], sectorFocus: "Technology", chequeSize: "$250k-$2m", leadDeals: true },
  { name: "Taronga Ventures", website: "https://tarongaventures.com/", headquarters: "Sydney", type: "VC", stagesFocus: ["Seed", "Series A"], sectorFocus: "Climate Tech, Sustainability", currentFund: "$50m", leadDeals: true },
  { name: "Telstra Ventures", website: "https://telstraventures.com/", headquarters: "Sydney", otherOffices: "San Francisco", type: "CVC", stagesFocus: ["Series A", "Series B", "Growth"], sectorFocus: "Enterprise Software, Telecommunications", currentFund: "$300m", leadDeals: true },
  { name: "TEN13", website: "https://www.ten13.vc/", headquarters: "Melbourne", type: "VC", stagesFocus: ["Seed", "Series A"], sectorFocus: "Technology", chequeSize: "$500k-$2m", leadDeals: true },
  { name: "Tiger Global", website: "https://www.tigerglobal.com/", headquarters: "New York", type: "VC", stagesFocus: ["Series A", "Series B", "Growth"], sectorFocus: "Technology", leadDeals: true },
  { name: "Tin Alley Ventures", website: "https://tinalley.com.au/", headquarters: "Melbourne", type: "VC", stagesFocus: ["Seed"], sectorFocus: "University commercialisation", chequeSize: "$50k-$250k" },
  { name: "Tidal Ventures", website: "https://tidal.vc/", headquarters: "Sydney", type: "VC", stagesFocus: ["Pre-Seed", "Seed"], sectorFocus: "Technology", chequeSize: "$100k-$500k", leadDeals: true },
  { name: "Uniseed", website: "https://www.uniseed.com.au/", headquarters: "Brisbane", type: "VC", stagesFocus: ["Seed"], sectorFocus: "University IP commercialisation", currentFund: "$80m", leadDeals: true },
  { name: "VentureCrowd", website: "https://www.venturecrowd.com.au/", headquarters: "Sydney", type: "Crowdfunding", stagesFocus: ["Seed", "Series A"], sectorFocus: "Technology, Property" },
  { name: "Virescent Ventures", website: "https://virescentventures.com/", headquarters: "Sydney", type: "VC", stagesFocus: ["Seed", "Series A"], sectorFocus: "Climate Tech, Ag Tech", leadDeals: true },
  { name: "W23 Global", website: "https://w23.global/", headquarters: "Sydney", type: "CVC", stagesFocus: ["Series A", "Series B"], sectorFocus: "Retail Tech", leadDeals: true },
  { name: "Woolworths Group Ventures", website: "https://www.woolworthsgroup.com.au/", headquarters: "Sydney", type: "CVC", stagesFocus: ["Series A", "Series B"], sectorFocus: "Retail, Food Tech" },
  { name: "Y Combinator", website: "https://www.ycombinator.com/", headquarters: "San Francisco", type: "Accelerator", stagesFocus: ["Pre-Seed"], sectorFocus: "Technology", chequeSize: "$500k", leadDeals: true },
  { name: "Zetta Venture Partners", website: "https://zettavp.com/", headquarters: "San Francisco", type: "VC", stagesFocus: ["Seed", "Series A"], sectorFocus: "AI, Machine Learning", leadDeals: true },
  { name: "Flying Fox Ventures", website: "https://flyingfoxventures.com.au/", headquarters: "Sydney", type: "VC", stagesFocus: ["Seed", "Series A"], sectorFocus: "Consumer Tech", leadDeals: true },
  { name: "Equity Venture Partners", website: "https://evp.com.au/", headquarters: "Sydney", type: "VC", stagesFocus: ["Pre-Seed", "Seed"], sectorFocus: "Technology", chequeSize: "$100k-$500k", leadDeals: true },
  { name: "Rampersand", website: "https://rampersand.vc/", headquarters: "Melbourne", type: "VC", stagesFocus: ["Seed", "Series A"], sectorFocus: "B2B Software", currentFund: "$100m", leadDeals: true },
  { name: "Our Innovation Fund", website: "https://ourinnovationfund.com.au/", headquarters: "Sydney", type: "VC", stagesFocus: ["Series A", "Series B"], sectorFocus: "Technology", currentFund: "$150m", leadDeals: true }
];

export async function importInvestors() {
  console.log('Starting investor data import...');
  let firmsInserted = 0;
  let investorsInserted = 0;
  let skipped = 0;

  for (const inv of investorData) {
    const isIndividual = inv.type === 'Angel';
    
    if (isIndividual) {
      const nameParts = inv.name.split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ') || '';
      
      const existing = await db.select().from(investors)
        .where(ilike(investors.firstName, firstName))
        .limit(1);
      
      if (existing.length === 0) {
        await db.insert(investors).values({
          firstName: firstName,
          lastName: lastName,
          title: 'Angel Investor',
          investorType: 'Angel',
          stages: inv.stagesFocus || [],
          sectors: inv.sectorFocus ? [inv.sectorFocus] : [],
          location: inv.headquarters || 'Australia',
          bio: null
        });
        investorsInserted++;
        console.log(`Inserted investor: ${inv.name}`);
      } else {
        skipped++;
      }
    } else {
      const existing = await db.select().from(investmentFirms)
        .where(ilike(investmentFirms.name, inv.name))
        .limit(1);
      
      if (existing.length === 0) {
        await db.insert(investmentFirms).values({
          name: inv.name,
          website: inv.website || null,
          type: inv.type || 'VC',
          description: inv.sectorFocus || null,
          location: inv.headquarters || null,
          hqLocation: inv.headquarters || null,
          aum: inv.currentFund || null,
          typicalCheckSize: inv.chequeSize || null,
          stages: inv.stagesFocus || [],
          sectors: inv.sectorFocus ? [inv.sectorFocus] : []
        });
        firmsInserted++;
        console.log(`Inserted firm: ${inv.name}`);
      } else {
        skipped++;
      }
    }
  }

  console.log(`\nImport complete!`);
  console.log(`Investment firms inserted: ${firmsInserted}`);
  console.log(`Individual investors inserted: ${investorsInserted}`);
  console.log(`Skipped (already exists): ${skipped}`);
  
  return { firmsInserted, investorsInserted, skipped };
}
