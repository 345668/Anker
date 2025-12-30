import { db } from "../db";
import { investmentFirms } from "@shared/schema";
import { eq } from "drizzle-orm";

interface FamilyOfficeData {
  name: string;
  country?: string;
  website?: string;
  linkedinUrl?: string;
  email?: string;
  phone?: string;
  notes?: string;
  keyContacts?: string;
}

const familyOfficesData: FamilyOfficeData[] = [
  // Netherlands Family Offices (File 1)
  { name: "Van der Vorm Vastgoed BV", country: "Netherlands", linkedinUrl: "https://nl.linkedin.com/company/van-der-vorm-vastgoed-bv" },
  { name: "31Capital", country: "Netherlands", linkedinUrl: "https://nl.linkedin.com/company/31capital-nl", keyContacts: "Marcel van den Heuvel, Vincent Snoek, Richard van der Vlist, Guus Michels" },
  { name: "Anthos Capital", country: "Netherlands", notes: "Part of Anthos Fund & AM" },
  { name: "Knop Investments", country: "Netherlands", website: "https://www.knopinvestments.com/en/", linkedinUrl: "https://nl.linkedin.com/company/knop-investments", email: "info@knopinvestments.com" },
  { name: "InsingerGilissen | A Quintet Private Bank", country: "Netherlands", website: "https://www.insingergilissen.nl/en-nl/", linkedinUrl: "https://www.linkedin.com/company/insingergilissen", email: "privatebanking@insingergilissen.nl", phone: "+31 20 521 50 00" },
  { name: "De Groot Family Office", country: "Netherlands", website: "https://dgfo.com/", linkedinUrl: "https://www.linkedin.com/company/de-groot-family-office" },
  { name: "Bfamily B.V.", country: "Netherlands", linkedinUrl: "https://nl.linkedin.com/company/bfamily-b-v" },
  { name: "Kaya Capital", country: "Netherlands", website: "https://www.kayacapital.nl/", linkedinUrl: "https://nl.linkedin.com/company/kaya-capital", keyContacts: "Jaap van Dijk, Lodewijk de Mol van Otterloo, Maurits van Boetzelaer, Dominique Bech" },
  { name: "Timeless Investments", country: "Netherlands", linkedinUrl: "https://nl.linkedin.com/company/timeless-investments", keyContacts: "Tim van Veggel — Managing Partner" },
  { name: "Janivo Holding B.V.", country: "Netherlands", website: "https://www.janivo.nl/", linkedinUrl: "https://nl.linkedin.com/company/janivo-holding-b-v" },
  { name: "Reggeborgh", country: "Netherlands", website: "https://www.reggeborgh.nl/", linkedinUrl: "https://nl.linkedin.com/company/reggeborgh" },
  { name: "Statera Family Office", country: "Netherlands", website: "http://www.staterabv.nl/", linkedinUrl: "https://nl.linkedin.com/company/statera-family-office" },
  { name: "Boron Management BV", country: "Netherlands" },
  { name: "CommonWealth Investments B.V.", country: "Netherlands", website: "http://www.commonwealth.nl/", linkedinUrl: "https://nl.linkedin.com/company/commonwealth-investments-b-v" },
  { name: "Navitas Capital", country: "Netherlands" },
  { name: "Bloom Family Office", country: "Netherlands", website: "http://www.bloomfamilyoffice.com/", linkedinUrl: "https://www.linkedin.com/company/bloomfamilyoffices", keyContacts: "Sabine van Hulst-Verhulst — Owner/Founder" },
  { name: "De Rendtmeesters", country: "Netherlands" },
  { name: "Tripos Family Office", country: "Netherlands", linkedinUrl: "https://lu.linkedin.com/company/tripos-beheer-b.v." },
  { name: "Family Capital Management", country: "Netherlands", linkedinUrl: "https://nl.linkedin.com/company/family-capital-management" },
  { name: "Commenda", country: "Netherlands", website: "http://www.commenda.eu/", linkedinUrl: "https://nl.linkedin.com/company/commenda-family-office" },
  { name: "MGI Family Office", country: "Netherlands", website: "https://mginvestment.com/", linkedinUrl: "https://gh.linkedin.com/company/mgi-nv", keyContacts: "Marcel Melis — CEO", email: "info@mginvestment.com", phone: "+31 6 52 697 784" },
  { name: "Euro-Rijn Group", country: "Netherlands" },

  // European Family Offices (File 2)
  { name: "UCEA - Family Office Group", country: "United Kingdom", linkedinUrl: "https://www.linkedin.com/company/ucea-family-office-group" },
  { name: "WSH Family Office GmbH", country: "Germany", linkedinUrl: "https://www.linkedin.com/company/wsh-family-office-gmbh" },
  { name: "Santa Devota Group", country: "Italy", website: "https://www.santadevota.com", linkedinUrl: "https://www.linkedin.com/company/santa-devota-group", email: "info@santadevota.com" },
  { name: "PFC Family Office", country: "Italy", linkedinUrl: "https://www.linkedin.com/company/pfc-family-office" },
  { name: "KIATT", country: "United Kingdom", website: "https://www.kiatt.co.uk", linkedinUrl: "https://www.linkedin.com/company/kiatt", email: "info@kiatt.co.uk" },
  { name: "LMDV Capital", country: "Italy", website: "https://www.lmdvcapital.com", linkedinUrl: "https://www.linkedin.com/company/lmdv-capital", email: "info@lmdvcapital.com", notes: "Del Vecchio family SFO" },
  { name: "TRESONO Family Office AG", country: "Germany", website: "https://www.tresono.com", linkedinUrl: "https://www.linkedin.com/company/tresono-family-office-ag", email: "info@tresono.com" },
  { name: "Lind Invest", country: "Denmark", website: "https://www.lindinvest.dk", linkedinUrl: "https://www.linkedin.com/company/lind-invest", email: "info@lindinvest.dk" },
  { name: "Ceniarth", country: "United Kingdom", website: "https://www.ceniarthllc.com", linkedinUrl: "https://www.linkedin.com/company/ceniarth", email: "info@ceniarthllc.com", notes: "Impact-focused family office" },
  { name: "KOEHLER.GROUP", country: "Germany", website: "https://www.koehler.com", linkedinUrl: "https://www.linkedin.com/company/koehler-group", email: "info@koehler.com", notes: "Industrial family office group" },
  { name: "TY Danjuma Family Office", country: "United Kingdom", linkedinUrl: "https://www.linkedin.com/company/ty-danjuma-family-office" },
  { name: "Qmulus", country: "Netherlands", website: "https://www.qmulus.com", linkedinUrl: "https://www.linkedin.com/company/qmulus", email: "info@qmulus.com" },
  { name: "Florac", country: "France", website: "https://www.florac.eu", linkedinUrl: "https://www.linkedin.com/company/florac", email: "info@florac.eu" },
  { name: "FIDES Holdings", country: "Italy", linkedinUrl: "https://www.linkedin.com/company/fides-holdings" },
  { name: "Alvarium Investment Managers (Suisse) SA", country: "Switzerland", website: "https://www.alvarium.com", linkedinUrl: "https://www.linkedin.com/company/alvarium-investment-managers", email: "info@alvarium.com" },
  { name: "COHERE Family Office A/S", country: "Denmark", linkedinUrl: "https://www.linkedin.com/company/cohere-family-office" },
  { name: "DIVAS Asset Management AG", country: "Switzerland", website: "https://www.divas-am.com", linkedinUrl: "https://www.linkedin.com/company/divas-asset-management-ag", email: "info@divas-am.com" },
  { name: "Blink Impact", country: "Netherlands", website: "https://www.blinkimpact.com", linkedinUrl: "https://www.linkedin.com/company/blink-impact", email: "info@blinkimpact.com", notes: "Impact-focused family office" },
  { name: "RKKVC", country: "Poland", linkedinUrl: "https://www.linkedin.com/company/rkkvc" },
  { name: "BLN Capital", country: "Germany", website: "https://www.blncapital.com", linkedinUrl: "https://www.linkedin.com/company/bln-capital", email: "info@blncapital.com" },
  { name: "Horizon21 AG", country: "Switzerland", website: "https://www.horizon21.com", linkedinUrl: "https://www.linkedin.com/company/horizon21-ag", email: "info@horizon21.com" },
  { name: "infinitas capital", country: "Malta", website: "https://www.infinitascapital.com", linkedinUrl: "https://www.linkedin.com/company/infinitas-capital", email: "info@infinitascapital.com" },
  { name: "PG3 AG", country: "Switzerland", linkedinUrl: "https://www.linkedin.com/company/pg3-ag" },
  { name: "Sentinel Capital", country: "United Kingdom", website: "https://www.sentinelcapital.co.uk", linkedinUrl: "https://www.linkedin.com/company/sentinel-capital", email: "info@sentinelcapital.co.uk" },
  { name: "Cocoa Capital", country: "Switzerland", linkedinUrl: "https://www.linkedin.com/company/cocoa-capital" },
  { name: "Belleville Management", country: "Luxembourg", linkedinUrl: "https://www.linkedin.com/company/belleville-management" },
  { name: "Four Corporation", country: "United Kingdom", linkedinUrl: "https://www.linkedin.com/company/four-corporation" },
  { name: "PRIMWEST SA", country: "Switzerland", website: "https://www.primwest.com", linkedinUrl: "https://www.linkedin.com/company/primwest-sa", email: "info@primwest.com" },
  { name: "Zibra Family Office", country: "Denmark", linkedinUrl: "https://www.linkedin.com/company/zibra-family-office" },
  { name: "FRK Investments", country: "Ireland", linkedinUrl: "https://www.linkedin.com/company/frk-investments" },
  { name: "Hellen's Rock Capital", country: "Romania", linkedinUrl: "https://www.linkedin.com/company/hellens-rock-capital" },
  { name: "Tethys", country: "Greece", website: "https://www.tethys.com", linkedinUrl: "https://www.linkedin.com/company/tethys", email: "info@tethys.com" },
  { name: "WAM Investments", country: "Portugal", linkedinUrl: "https://www.linkedin.com/company/wam-investments" },
  { name: "Laurion Group", country: "Luxembourg", website: "https://www.lauriongroup.com", linkedinUrl: "https://www.linkedin.com/company/laurion-group", email: "info@lauriongroup.com" },
  { name: "Edelkapital AG", country: "Liechtenstein", website: "https://www.edelkapital.li", linkedinUrl: "https://www.linkedin.com/company/edelkapital-ag", email: "info@edelkapital.li" },
  { name: "VAMTAJ", country: "Luxembourg", linkedinUrl: "https://www.linkedin.com/company/vamtaj" },
  { name: "JML Invest", country: "France", linkedinUrl: "https://www.linkedin.com/company/jml-invest" },
  { name: "Amcari Limited", country: "Gibraltar", linkedinUrl: "https://www.linkedin.com/company/amcari-limited" },
  { name: "Paginera Family Office", country: "Sweden", linkedinUrl: "https://www.linkedin.com/company/paginera-family-office" },
  { name: "Somerston Asset Management Limited", country: "Jersey", website: "https://www.somerston.com", linkedinUrl: "https://www.linkedin.com/company/somerston-asset-management", email: "info@somerston.com" },

  // UK Family Offices (File 3)
  { name: "Family Office Fund", country: "United Kingdom" },
  { name: "Family Office of Ager-Hanssen", country: "United Kingdom" },
  { name: "Kirkcaldy Family Office", country: "United Kingdom" },
  { name: "Cavendish Family Office", country: "United Kingdom", website: "https://www.cavfo.com/", linkedinUrl: "https://www.linkedin.com/company/cavendish-family-office/" },
  { name: "Carter Family Office", country: "United Kingdom" },
  { name: "Family Office in London", country: "United Kingdom" },
  { name: "Kenfin Family Office", country: "United Kingdom" },
  { name: "The Pearl Family Office", country: "United Kingdom" },
  { name: "Fink Family Office", country: "United Kingdom", linkedinUrl: "https://www.linkedin.com/company/fink-family-office/" },
  { name: "BKS Family Office Limited", country: "Jersey", notes: "UK Crown Dependency" },
  { name: "OPES Family Office", country: "United Kingdom", linkedinUrl: "https://www.linkedin.com/company/opes-family-office/" },
  { name: "Fry Family Office", country: "United Kingdom" },
  { name: "Wright Family Office", country: "United Kingdom" },
  { name: "UR FAMILY OFFICE (UFO)", country: "United Kingdom" },
  { name: "PECA - Family Office", country: "United Kingdom", linkedinUrl: "https://www.linkedin.com/company/peca-limited/" },
  { name: "Pardus Family Office", country: "United Kingdom", linkedinUrl: "https://www.linkedin.com/company/pardus-family-office/" },
  { name: "Fiducia Partners Limited", country: "United Kingdom", website: "https://fiduciapartners.com/", linkedinUrl: "https://www.linkedin.com/company/fiducia-partners-limited/", keyContacts: "Michael D Oliver — Founder & CEO", email: "info@fiduciapartners.com", phone: "020 3422 1001" },
  { name: "FERGUSON PARTNERS FAMILY OFFICE LIMITED", country: "United Kingdom" },
  { name: "Time Family Office", country: "United Kingdom" },
  { name: "Kessler Family Office", country: "United Kingdom", linkedinUrl: "https://www.linkedin.com/company/kessler-family-office/" },
  { name: "Topaz and Eze Family Office", country: "United Kingdom" },
  { name: "Damazein Family Office", country: "United Kingdom" },
  { name: "Realia Family Office", country: "United Kingdom" },
  { name: "Pall Mall Family Office", country: "United Kingdom", website: "https://pmfo.global", linkedinUrl: "https://uk.linkedin.com/company/pall-mall-family-office-ltd", keyContacts: "David Alexander F.R.S.A., Edson Pacul" },
  { name: "Virtus Multi-Family Office", country: "United Kingdom" },
  { name: "McCarthy Hill Family Office", country: "United Kingdom" },
  { name: "Ashberg Multi-Family Office", country: "United Kingdom" },
  { name: "Cosmos Family Office", country: "United Kingdom" },
  { name: "Tintra Holdings", country: "United Kingdom" },
  { name: "Rocco Forte Hotels (Family Office)", country: "United Kingdom", website: "https://www.roccofortehotels.com" },
  { name: "Vardy Family Office Limited", country: "United Kingdom" },
  { name: "Belgravia (Family Office)", country: "United Kingdom" },
  { name: "SIAHAF Management Ltd", country: "United Kingdom", notes: "UK/Brunei Family Office" },
  { name: "Volare Aviation Limited", country: "United Kingdom" },
  { name: "Alpha Blue Ocean", country: "United Kingdom" },
  { name: "J. Stern & Co.", country: "United Kingdom", website: "https://www.jsternco.com", linkedinUrl: "https://uk.linkedin.com/company/j-stern-%26-co-" },
  { name: "Man Capital LLP", country: "United Kingdom" },

  // UAE Family Offices (File 4)
  { name: "Wami Capital", country: "UAE", linkedinUrl: "https://www.linkedin.com/company/wami-capital-limited", keyContacts: "Bajrang Singh, Anisha Ramakrishnan, Ritesh Sivaswamy Ramakrishnan, Karan Bhatia", notes: "SFO managing family capital based in Dubai" },
  { name: "SKH Family Office", country: "UAE", website: "https://skhfamilyoffice.com/", linkedinUrl: "https://www.linkedin.com/company/skh-family-office", keyContacts: "Saqr Kamal Hasan — Founder & Chairman", email: "contact@skhfamilyoffice.com" },
  { name: "Böschen Family Office", country: "UAE" },
  { name: "Muhammad Bana Family Office", country: "UAE" },
  { name: "Shevardnadze Family Office", country: "UAE" },
  { name: "Ekushevsky Family Office", country: "UAE" },
  { name: "The Carling Group", country: "UAE", notes: "Private Family Office" },
  { name: "Fala Group", country: "UAE" },
  { name: "Huriya Private", country: "UAE" },
  { name: "RKMehrotra Family Office", country: "UAE" },
  { name: "Vivium", country: "UAE", linkedinUrl: "https://ae.linkedin.com/company/vivium-holding", keyContacts: "Elie Khouri — Founder/Principal", email: "info@vivium.com", notes: "Single family office managing diversified investments" },
  { name: "1707 Capital", country: "UAE" },
  { name: "Parasol Capital", country: "UAE" },
  { name: "TIBERIUS", country: "UAE", linkedinUrl: "https://ch.linkedin.com/company/tiberuis", keyContacts: "Tomislav Vagaja, Yobert Younan", notes: "Multinational footprint including Dubai" },
  { name: "Excess Investment", country: "UAE" },
  { name: "FINCASA CAPITAL", country: "UAE" },
  { name: "AFO Group", country: "UAE" },
  { name: "DR Partners L.L.C", country: "UAE" },
  { name: "Al Mazrouei Investments", country: "UAE" },
  { name: "Bright Start LLC", country: "UAE" },
  { name: "6G Capital", country: "UAE" },
  { name: "Almulla Capital", country: "UAE" },
  { name: "Hamilton Bradshaw MENA", country: "UAE" },
  { name: "GTCC Wealth", country: "UAE" },
  { name: "PHINOM", country: "UAE" },
  { name: "Bravo Holding (Family Office)", country: "UAE" },
  { name: "ORX Investment LTD", country: "UAE" },
  { name: "Uber Investments", country: "UAE" },
  { name: "Mostafa Bin Abdullatif Investments L.L.C", country: "UAE" },
  { name: "AJ Capital & Investments", country: "UAE" },
  { name: "Starling International Management Limited", country: "UAE" },
  { name: "W Ventures Holding", country: "UAE" },
  { name: "Octagon UAE", country: "UAE" },
  { name: "Fortuna Holdings", country: "UAE" },
  { name: "Tharwat Investment Holding Limited", country: "UAE" },
  { name: "Acube Holdings", country: "UAE" },
  { name: "Theia Investments Limited", country: "UAE" },
  { name: "Delta Momentum Group", country: "UAE" },

  // Luxembourg Family Offices (File 5)
  { name: "Star Financial", country: "Luxembourg", website: "https://starfinancial.lu/", linkedinUrl: "https://lu.linkedin.com/company/star-financial", email: "info@starfinancial.lu", phone: "+352 27687742", notes: "Single family office; investment in private & alternative assets" },
  { name: "Lux Videre", country: "Luxembourg" },
  { name: "Claster Group", country: "Luxembourg" },
  { name: "ALBIDANIA Family Office", country: "Luxembourg" },
  { name: "Wexford Group", country: "Luxembourg", linkedinUrl: "https://lu.linkedin.com/company/wexford-group", keyContacts: "Andrew de Murga" },
  { name: "DeBa Group S.A. SPF", country: "Luxembourg", linkedinUrl: "https://lu.linkedin.com/company/deba-group-s-a-spf", keyContacts: "Devrim Özbugutu — Founder" },
  { name: "Augemus SA", country: "Luxembourg", website: "https://www.augemus.lu", linkedinUrl: "https://lu.linkedin.com/company/augemus", keyContacts: "Willem Frijling, Alexander de Vreeze — Director, Tanguy Besrest — Investment Director, Gert-Jan Slothouber — Director", notes: "Multi-family office" },
  { name: "JAJ Investment Group", country: "Luxembourg", linkedinUrl: "https://lu.linkedin.com/company/jajinvestmentgroup", keyContacts: "Jacques Chahine — Founder, Jennifer Martin, Balaji Anaa", notes: "Global investment focus" },
  { name: "NOIA Capital", country: "Luxembourg", linkedinUrl: "https://de.linkedin.com/company/noia-capital", keyContacts: "Nicolas Vassaux, Jérôme Lhoist, Evan Rey Langam", notes: "Multi-family office focused on growth capital" },
  { name: "ARIZONA INVESTISSEMENTS SA", country: "Luxembourg" },
  { name: "Genii Capital", country: "Luxembourg" },
  { name: "WACC - Family Office", country: "Luxembourg" },
  { name: "GMS+ Luxembourg Family Office", country: "Luxembourg" },
  { name: "Andreas Capital", country: "Luxembourg" },
  { name: "Verona Advisory", country: "Luxembourg" },
  { name: "Bonacapital Family Office S.A.", country: "Luxembourg" },
  { name: "FI&FO", country: "Luxembourg" },
  { name: "My Family Office", country: "Luxembourg" },
  { name: "family office JADEN", country: "Luxembourg" },
  { name: "GS Finances", country: "Luxembourg" },
  { name: "1875 FINANCE (Luxembourg) SA", country: "Luxembourg" },
  { name: "Harmony Family Office", country: "Luxembourg" },
  { name: "Catalpa Ventures Family Office", country: "Luxembourg" },
  { name: "HAWK family office", country: "Luxembourg" },
  { name: "Degroof Petercam (Family Office)", country: "Luxembourg", website: "https://www.degroofpetercam.com", linkedinUrl: "https://www.linkedin.com/company/degroof-petercam", email: "info@degroofpetercam.com", phone: "+352 2624 711", notes: "Large wealth manager with family office services" },
  { name: "Family Partners", country: "Luxembourg" },
  { name: "Mably Family Office", country: "Luxembourg" },
  { name: "Groupe Phi Participations", country: "Luxembourg" },
  { name: "VALFIDUS", country: "Luxembourg" },
  { name: "Ypsilon Group", country: "Luxembourg" },
  { name: "LOGIVER WEALTH MANAGEMENT", country: "Luxembourg" },
  { name: "DuF Holding", country: "Luxembourg", linkedinUrl: "https://lu.linkedin.com/company/duf-holding" },
  { name: "ESPERIA", country: "Luxembourg" },
  { name: "AlphaBee Asset Management", country: "Luxembourg" },
  { name: "ALCYONE & ASSOCIES", country: "Luxembourg" },
  { name: "Echotraffic", country: "Luxembourg" },
  { name: "Timeo Neutral Sicav", country: "Luxembourg" },
];

export async function seedFamilyOffices(): Promise<{ inserted: number; skipped: number }> {
  console.log("[Seed] Starting family offices seed...");
  
  let inserted = 0;
  let skipped = 0;

  for (const fo of familyOfficesData) {
    try {
      // Check if already exists by name
      const existing = await db
        .select()
        .from(investmentFirms)
        .where(eq(investmentFirms.name, fo.name))
        .limit(1);

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      // Build description from available info
      const descParts: string[] = [];
      if (fo.notes) descParts.push(fo.notes);
      if (fo.keyContacts) descParts.push(`Key Contacts: ${fo.keyContacts}`);
      
      await db.insert(investmentFirms).values({
        name: fo.name,
        type: "Family Office",
        firmClassification: "Family Office",
        location: fo.country,
        hqLocation: fo.country,
        website: fo.website || null,
        linkedinUrl: fo.linkedinUrl || null,
        description: descParts.length > 0 ? descParts.join(". ") : null,
      });

      inserted++;
    } catch (error: any) {
      console.error(`[Seed] Error inserting ${fo.name}:`, error.message);
    }
  }

  console.log(`[Seed] Family offices seed complete: ${inserted} inserted, ${skipped} skipped (already exist)`);
  return { inserted, skipped };
}

