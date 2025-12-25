import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate, Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  Rocket, Building2, Users, ArrowRight, CheckCircle, Sparkles,
  TrendingUp, Target, DollarSign, Loader2, Zap, Home, LayoutDashboard, LogOut, LogIn
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import DotPattern from "@/components/magicui/dot-pattern";
import Particles from "@/components/magicui/particles";

const industriesData = {
  'BioTech': ['Drug Discovery', 'Gene Therapy', 'Bioengineering', 'Synthetic Biology', 'Clinical Trials', 'Diagnostics', 'Medical Devices'],
  'Semiconductors': ['Chip Design', 'Chip Manufacturing', 'EDA Tools', 'Packaging', 'Memory', 'Analog', 'Power Management'],
  'FinTech': ['Payments', 'Banking', 'Lending', 'InsurTech', 'WealthTech', 'RegTech', 'Trading', 'Crypto/Blockchain'],
  'HealthTech': ['Digital Health', 'Telemedicine', 'MedTech', 'Health Data', 'Mental Health', 'Wellness', 'Medical Imaging'],
  'SaaS': ['B2B SaaS', 'Enterprise SaaS', 'Vertical SaaS', 'Productivity', 'Collaboration', 'DevOps', 'Security'],
  'E-commerce': ['D2C', 'Marketplace', 'Retail Tech', 'B2C', 'B2B2C', 'Social Commerce', 'Subscription'],
  'AI/ML': ['Computer Vision', 'NLP', 'Deep Learning', 'Robotics', 'Autonomous Systems', 'Data Analytics', 'MLOps'],
  'CleanTech': ['Solar', 'Wind', 'Energy Storage', 'Carbon Capture', 'Sustainability', 'Water Tech', 'Waste Management'],
  'EdTech': ['Online Learning', 'Corporate Training', 'K-12', 'Higher Ed', 'Skills Training', 'Language Learning'],
  'AgTech': ['Precision Agriculture', 'Farm Management', 'AgBiotech', 'Vertical Farming', 'Supply Chain', 'FoodTech'],
  'Hardware': ['IoT', 'Consumer Electronics', 'Industrial', 'Wearables', 'Smart Home', 'Sensors', 'Drones'],
  'Mobility': ['Autonomous Vehicles', 'EVs', 'Micromobility', 'Fleet Management', 'Logistics', 'Supply Chain'],
  'PropTech': ['Real Estate', 'Construction Tech', 'Smart Buildings', 'Facilities Management', 'Prop Management'],
  'Media & Entertainment': ['Streaming', 'Gaming', 'Content Creation', 'Social Media', 'Creator Economy', 'Esports', 'AR/VR'],
  'Enterprise Software': ['CRM', 'ERP', 'HR Tech', 'Sales Tech', 'Marketing Tech', 'Customer Success', 'Analytics'],
  'Cybersecurity': ['Network Security', 'Cloud Security', 'Identity', 'Threat Detection', 'Compliance', 'Data Protection'],
  'DeepTech': ['Quantum Computing', 'Advanced Materials', 'Nanotechnology', 'Photonics', 'Space Tech', 'Aerospace'],
  'Consumer': ['CPG', 'Fashion', 'Beauty', 'Food & Beverage', 'Home Goods', 'Pet Tech', 'Lifestyle'],
  'Infrastructure': ['Cloud Infrastructure', 'DevTools', 'APIs', 'Data Infrastructure', 'Networking', 'Developer Platform'],
  'LegalTech': ['Contract Management', 'eDiscovery', 'Compliance', 'IP Management', 'Legal Operations', 'Litigation'],
  'Other': ['Custom - Specify Below']
};

const businessModels = ['B2B', 'B2C', 'B2B2C', 'Marketplace', 'Platform', 'Enterprise', 'SMB', 'Consumer'];

const stages = ['Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C+', 'Growth'];

const countriesWithStates = {
  'United States': ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming', 'District of Columbia'],
  'Canada': ['Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador', 'Nova Scotia', 'Ontario', 'Prince Edward Island', 'Quebec', 'Saskatchewan', 'Northwest Territories', 'Nunavut', 'Yukon'],
  'United Kingdom': ['England', 'Scotland', 'Wales', 'Northern Ireland'],
  'Germany': ['Baden-Württemberg', 'Bavaria', 'Berlin', 'Brandenburg', 'Bremen', 'Hamburg', 'Hesse', 'Lower Saxony', 'Mecklenburg-Vorpommern', 'North Rhine-Westphalia', 'Rhineland-Palatinate', 'Saarland', 'Saxony', 'Saxony-Anhalt', 'Schleswig-Holstein', 'Thuringia'],
  'Australia': ['New South Wales', 'Victoria', 'Queensland', 'Western Australia', 'South Australia', 'Tasmania', 'Australian Capital Territory', 'Northern Territory'],
  'India': ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi'],
  'Brazil': ['Acre', 'Alagoas', 'Amapá', 'Amazonas', 'Bahia', 'Ceará', 'Distrito Federal', 'Espírito Santo', 'Goiás', 'Maranhão', 'Mato Grosso', 'Mato Grosso do Sul', 'Minas Gerais', 'Pará', 'Paraíba', 'Paraná', 'Pernambuco', 'Piauí', 'Rio de Janeiro', 'Rio Grande do Norte', 'Rio Grande do Sul', 'Rondônia', 'Roraima', 'Santa Catarina', 'São Paulo', 'Sergipe', 'Tocantins'],
  'Mexico': ['Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua', 'Coahuila', 'Colima', 'Durango', 'Guanajuato', 'Guerrero', 'Hidalgo', 'Jalisco', 'Mexico', 'Mexico City', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas'],
  'France': ['Île-de-France', 'Auvergne-Rhône-Alpes', 'Provence-Alpes-Côte d\'Azur', 'Nouvelle-Aquitaine', 'Occitanie', 'Hauts-de-France', 'Brittany', 'Normandy', 'Grand Est', 'Pays de la Loire', 'Bourgogne-Franche-Comté', 'Centre-Val de Loire', 'Corsica'],
  'Spain': ['Andalusia', 'Aragon', 'Asturias', 'Balearic Islands', 'Basque Country', 'Canary Islands', 'Cantabria', 'Castile and León', 'Castilla-La Mancha', 'Catalonia', 'Extremadura', 'Galicia', 'La Rioja', 'Madrid', 'Murcia', 'Navarre', 'Valencia'],
  'Italy': ['Abruzzo', 'Basilicata', 'Calabria', 'Campania', 'Emilia-Romagna', 'Friuli-Venezia Giulia', 'Lazio', 'Liguria', 'Lombardy', 'Marche', 'Molise', 'Piedmont', 'Apulia', 'Sardinia', 'Sicily', 'Tuscany', 'Trentino-South Tyrol', 'Umbria', 'Aosta Valley', 'Veneto'],
  'China': ['Beijing', 'Shanghai', 'Tianjin', 'Chongqing', 'Guangdong', 'Zhejiang', 'Jiangsu', 'Shandong', 'Sichuan', 'Hubei', 'Henan', 'Fujian', 'Hunan', 'Anhui', 'Hebei', 'Liaoning', 'Shaanxi', 'Jiangxi', 'Heilongjiang', 'Guangxi', 'Yunnan', 'Jilin', 'Shanxi', 'Guizhou', 'Gansu', 'Inner Mongolia', 'Xinjiang', 'Hainan', 'Ningxia', 'Qinghai', 'Tibet', 'Hong Kong', 'Macau'],
  'Japan': ['Hokkaido', 'Aomori', 'Iwate', 'Miyagi', 'Akita', 'Yamagata', 'Fukushima', 'Ibaraki', 'Tochigi', 'Gunma', 'Saitama', 'Chiba', 'Tokyo', 'Kanagawa', 'Niigata', 'Toyama', 'Ishikawa', 'Fukui', 'Yamanashi', 'Nagano', 'Gifu', 'Shizuoka', 'Aichi', 'Mie', 'Shiga', 'Kyoto', 'Osaka', 'Hyogo', 'Nara', 'Wakayama', 'Tottori', 'Shimane', 'Okayama', 'Hiroshima', 'Yamaguchi', 'Tokushima', 'Kagawa', 'Ehime', 'Kochi', 'Fukuoka', 'Saga', 'Nagasaki', 'Kumamoto', 'Oita', 'Miyazaki', 'Kagoshima', 'Okinawa'],
  'South Korea': ['Seoul', 'Busan', 'Daegu', 'Incheon', 'Gwangju', 'Daejeon', 'Ulsan', 'Sejong', 'Gyeonggi', 'Gangwon', 'North Chungcheong', 'South Chungcheong', 'North Jeolla', 'South Jeolla', 'North Gyeongsang', 'South Gyeongsang', 'Jeju'],
  'Netherlands': ['Drenthe', 'Flevoland', 'Friesland', 'Gelderland', 'Groningen', 'Limburg', 'North Brabant', 'North Holland', 'Overijssel', 'South Holland', 'Utrecht', 'Zeeland'],
  'Switzerland': ['Zurich', 'Bern', 'Lucerne', 'Uri', 'Schwyz', 'Obwalden', 'Nidwalden', 'Glarus', 'Zug', 'Fribourg', 'Solothurn', 'Basel-Stadt', 'Basel-Landschaft', 'Schaffhausen', 'Appenzell Ausserrhoden', 'Appenzell Innerrhoden', 'St. Gallen', 'Graubünden', 'Aargau', 'Thurgau', 'Ticino', 'Vaud', 'Valais', 'Neuchâtel', 'Geneva', 'Jura'],
  'Sweden': ['Stockholm', 'Uppsala', 'Södermanland', 'Östergötland', 'Jönköping', 'Kronoberg', 'Kalmar', 'Gotland', 'Blekinge', 'Skåne', 'Halland', 'Västra Götaland', 'Värmland', 'Örebro', 'Västmanland', 'Dalarna', 'Gävleborg', 'Västernorrland', 'Jämtland', 'Västerbotten', 'Norrbotten'],
  'Israel': ['Central', 'Haifa', 'Jerusalem', 'Northern', 'Southern', 'Tel Aviv'],
  'Singapore': ['Singapore'],
  'United Arab Emirates': ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'],
  'Other': ['Not Listed']
};

const AnimatedGridPattern = () => {
  return (
    <div className="absolute inset-0 opacity-20">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(to right, rgb(168 85 247 / 0.1) 1px, transparent 1px),
                           linear-gradient(to bottom, rgb(59 130 246 / 0.1) 1px, transparent 1px)`,
          backgroundSize: '50px 50px',
        }}
      />
    </div>
  );
};

const LiquidGlassCard = ({ children, className = '', gradient = '' }) => {
  return (
    <div className={`relative group ${className}`}>
      <div
        className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-30 rounded-3xl blur-2xl group-hover:opacity-50 group-hover:blur-3xl transition-all duration-700`}
      />

      <div className="relative backdrop-blur-xl bg-gradient-to-br from-white/50 to-white/30 border border-white/60 rounded-3xl shadow-lg hover:shadow-xl transition-all duration-500 overflow-hidden">
        <div className="absolute inset-px rounded-3xl bg-gradient-to-br from-white/60 via-white/40 to-white/30 pointer-events-none" />

        <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
          <div className="absolute top-0 -left-full w-full h-full bg-gradient-to-r from-transparent via-white/40 to-transparent group-hover:left-full transition-all duration-1000 ease-out" />
          <div className="absolute bottom-0 -right-full w-full h-full bg-gradient-to-l from-transparent via-purple-200/30 to-transparent group-hover:right-full transition-all duration-1200 ease-out delay-100" />
        </div>

        <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-400/10 via-pink-400/10 to-blue-400/10 animate-pulse" />
        </div>

        <div className="relative">{children}</div>
      </div>
    </div>
  );
};

const LiquidRainbowButton = ({ children, className = '', disabled = false, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group relative px-7 py-3.5 rounded-full overflow-hidden shadow-lg disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-600 via-orange-500 via-yellow-500 via-green-500 to-blue-600 bg-[length:200%_100%] animate-gradient" />
      <div className="absolute inset-0 backdrop-blur-sm bg-white/10" />
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
      <div className="absolute inset-px rounded-full bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />
      <span className="relative z-10 flex items-center justify-center gap-2 text-base font-semibold text-white drop-shadow-lg">
        {children}
      </span>
    </button>
  );
};

const StepPill = ({ icon: Icon, label, active }) => {
  return (
    <div
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border backdrop-blur-xl transition-all ${
        active
          ? 'bg-gradient-to-r from-white/60 to-white/40 border-white/70 shadow-lg'
          : 'bg-white/35 border-white/50'
      }`}
    >
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center border ${
          active
            ? 'bg-gradient-to-br from-purple-600/90 to-blue-600/90 border-white/60'
            : 'bg-white/40 border-white/50'
        }`}
      >
        <Icon className={`w-4 h-4 ${active ? 'text-white' : 'text-slate-700'}`} />
      </div>
      <span className={`text-sm font-semibold ${active ? 'text-slate-800' : 'text-slate-700'}`}>
        {label}
      </span>
    </div>
  );
};

const SectionHeader = ({ icon: Icon, title, description, gradient }) => {
  return (
    <div className="flex items-start gap-4">
      <div className="relative">
        <div className={`absolute inset-0 bg-gradient-to-br rounded-2xl blur-lg opacity-50 ${gradient}`} />
        <div className={`relative w-12 h-12 rounded-2xl bg-gradient-to-br border border-white/60 flex items-center justify-center shadow-lg ${gradient}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
      <div>
        <h2 className="text-2xl md:text-3xl font-bold text-slate-900">{title}</h2>
        <p className="text-slate-600 mt-1">{description}</p>
      </div>
    </div>
  );
};

const Field = ({ label, children, compact = false }) => {
  return (
    <div className={compact ? 'space-y-1' : 'space-y-2'}>
      <Label className={compact ? 'text-xs text-slate-600' : ''}>{label}</Label>
      <div className="rounded-2xl border border-white/70 bg-white/45 backdrop-blur-xl p-2.5 shadow-sm">
        {children}
      </div>
    </div>
  );
};

const RoleCard = ({ title, subtitle, icon: Icon, gradient, bullets, onClick }) => {
  return (
    <div onClick={onClick} className="cursor-pointer">
      <LiquidGlassCard gradient={gradient} className="h-full">
        <div className="p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-2xl font-bold text-slate-900">{title}</div>
              <div className="text-slate-600 mt-2">{subtitle}</div>
            </div>
            <div className="relative shrink-0">
              <div className={`absolute inset-0 rounded-2xl blur-lg opacity-50 ${gradient}`} />
              <div className={`relative w-14 h-14 rounded-2xl bg-gradient-to-br border border-white/60 flex items-center justify-center shadow-lg ${gradient}`}>
                <Icon className="w-7 h-7 text-white" />
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3">
            {bullets.map((b) => (
              <div key={b} className="flex items-center gap-3 text-sm text-slate-700">
                <div className="w-6 h-6 rounded-full bg-white/60 border border-white/70 flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                </div>
                <span className="font-medium">{b}</span>
              </div>
            ))}
          </div>

          <div className="mt-8">
            <LiquidRainbowButton className="w-full">
              Continue
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </LiquidRainbowButton>
          </div>
        </div>
      </LiquidGlassCard>
    </div>
  );
};

export default function Onboarding() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(null);
  const [userType, setUserType] = useState('');
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    company_name: '',
    job_title: '',
    linkedin_url: '',
    phone: '',
    bio: '',
    industries: [],
    stage: '',
    investment_focus: [],
    preferred_stages: [],
    check_size_min: '',
    check_size_max: '',
    firm_role: '',
    co_founders: [],
    advisors: [],
    team_size: '',
    pitch_deck_url: '',
    amount_raising: '',
    raise_min: '',
    raise_max: '',
    equity_offering: '',
    valuation: '',
    website: '',
    portfolio_url: '',
    country: '',
    city: '',
    is_incorporated: null,
    selected_industry: '',
    selected_sector: '',
    custom_industry: '',
    business_model: ''
  });
  const [matchingFirms, setMatchingFirms] = useState([]);
  const [selectedFirm, setSelectedFirm] = useState(null);
  const [searching, setSearching] = useState(false);
  const [availableSectors, setAvailableSectors] = useState([]);
  const [availableStates, setAvailableStates] = useState([]);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  const navigate = useNavigate();

  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await base44.auth.me();
        setUser(userData);
        
        if (userData.onboarding_completed) {
          navigate(createPageUrl('Dashboard'));
        }
      } catch (e) {
        base44.auth.redirectToLogin(createPageUrl('Onboarding'));
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, []);

  useEffect(() => {
    if (user && !step) {
      setStep('select-type');
    }
  }, [user]);

  const headerSubtitle = useMemo(() => {
    if (step === 'select-type') return "Tell us who you are, and we'll tailor the experience.";
    if (step === 'founder-profile') return 'Build a founder profile that investors can trust at a glance.';
    if (step === 'investor-profile') return 'Define your thesis and preferences for higher-signal deal flow.';
    return '';
  }, [step]);

  const handleTypeSelect = (type) => {
    setUserType(type);
    setStep(type === 'founder' ? 'founder-profile' : 'investor-profile');
  };

  const searchFirms = async (query) => {
    if (!query || query.length < 2) {
      setMatchingFirms([]);
      return;
    }
    
    setSearching(true);
    try {
      const firms = await base44.entities.InvestorFirm.list('-created_date', 100);
      const matches = firms.filter(f => 
        f.company_name?.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 5);
      setMatchingFirms(matches);
    } catch (error) {
      console.error('Error searching firms:', error);
    } finally {
      setSearching(false);
    }
  };

  const handleFirmSelect = (firm) => {
    setSelectedFirm(firm);
    setFormData({
      ...formData,
      company_name: firm.company_name
    });
    setMatchingFirms([]);
  };

  const handleIndustryChange = (industry) => {
    setFormData(prev => ({
      ...prev,
      selected_industry: industry,
      selected_sector: '',
      industries: industry ? [industry] : []
    }));
    setAvailableSectors(industriesData[industry] || []);
  };

  const handleSectorChange = (sector) => {
    setFormData(prev => ({
      ...prev,
      selected_sector: sector,
      industries: prev.selected_industry && sector ? [prev.selected_industry, sector] : prev.selected_industry ? [prev.selected_industry] : []
    }));
  };

  const handleCustomIndustryAdd = () => {
    if (formData.custom_industry.trim()) {
      setFormData(prev => ({
        ...prev,
        industries: [...(prev.industries || []), prev.custom_industry.trim()],
        custom_industry: ''
      }));
    }
  };

  const handleCountryChange = (country) => {
    setFormData(prev => ({
      ...prev,
      country: country,
      city: ''
    }));
    setAvailableStates(countriesWithStates[country] || []);
  };

  const toggleStage = (stage) => {
    setFormData(prev => ({
      ...prev,
      preferred_stages: prev.preferred_stages.includes(stage)
        ? prev.preferred_stages.filter(s => s !== stage)
        : [...prev.preferred_stages, stage]
    }));
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      const updateData = {
        full_name: `${formData.first_name} ${formData.last_name}`,
        user_type: userType,
        user_role: userType,
        onboarding_completed: true,
        onboarded_at: new Date().toISOString(),
        company_name: formData.company_name,
        job_title: formData.job_title,
        linkedin_url: formData.linkedin_url,
        phone: formData.phone,
        bio: formData.bio,
        industries: formData.industries,
        stage: formData.stage,
        investment_focus: formData.investment_focus,
        preferred_stages: formData.preferred_stages,
        check_size_min: formData.check_size_min ? Number(formData.check_size_min) : undefined,
        check_size_max: formData.check_size_max ? Number(formData.check_size_max) : undefined,
        firm_role: formData.firm_role
      };

      if (userType === 'investor' && selectedFirm) {
        updateData.firm_id = selectedFirm.id;
      }

      await base44.auth.updateMe(updateData);

      if (userType === 'founder' && formData.company_name) {
        const user = await base44.auth.me();
        await base44.entities.Startup.create({
          founder_id: user.id,
          company_name: formData.company_name,
          website: formData.website,
          industry: formData.industries,
          stage: formData.stage,
          location: formData.city && formData.country ? `${formData.city}, ${formData.country}` : (formData.city || formData.country || undefined),
          pitch_deck_url: formData.pitch_deck_url,
          co_founders: formData.co_founders,
          advisors: formData.advisors,
          team_size: formData.team_size ? Number(formData.team_size) : undefined,
          amount_raising: formData.amount_raising ? Number(formData.amount_raising) : undefined,
          raise_min: formData.raise_min ? Number(formData.raise_min) : undefined,
          raise_max: formData.raise_max ? Number(formData.raise_max) : undefined,
          equity_offering: formData.equity_offering ? Number(formData.equity_offering) : undefined,
          valuation: formData.valuation ? Number(formData.valuation) : undefined,
          status: 'draft'
        });
      }

      toast.success('Welcome aboard! 🎉');
      navigate(createPageUrl('Dashboard'));
    } catch (error) {
      console.error('Onboarding error:', error);
      toast.error('Failed to complete onboarding');
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-blue-50/30 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  const isFounderValid = !!formData.first_name && !!formData.last_name && !!formData.company_name && !!formData.selected_industry && !!formData.stage;
  const isInvestorValid = !!formData.first_name && !!formData.last_name && !!formData.company_name && !!formData.firm_role && formData.industries.length > 0 && formData.preferred_stages.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-blue-50/30 text-slate-900 overflow-hidden relative">
      <div
        className="pointer-events-none fixed inset-0 z-30 transition duration-300"
        style={{
          background: `radial-gradient(600px at ${mousePosition.x}px ${mousePosition.y}px, rgba(168, 85, 247, 0.15), transparent 80%)`,
        }}
      />

      <div className="fixed inset-0">
        <AnimatedGridPattern />
        <Particles
          className="absolute inset-0"
          quantity={45}
          ease={80}
          color="168, 85, 247"
          refresh={false}
        />

        <div className="absolute top-0 left-1/4 w-[520px] h-[520px] bg-gradient-to-br from-purple-400/25 to-pink-400/25 rounded-full blur-3xl animate-pulse" />
        <div
          className="absolute top-1/3 right-1/4 w-[420px] h-[420px] bg-gradient-to-br from-orange-400/25 to-yellow-400/25 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: '1s' }}
        />
        <div
          className="absolute bottom-0 left-1/3 w-[460px] h-[460px] bg-gradient-to-br from-green-400/25 to-blue-400/25 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: '2s' }}
        />
      </div>

      {/* Navigation Bar */}
      <nav className="relative z-50 border-b border-white/60 backdrop-blur-2xl bg-gradient-to-r from-white/55 to-white/40 shadow-lg">
        <div className="absolute inset-0 bg-gradient-to-r from-white/30 to-white/20 pointer-events-none" />
        <div className="max-w-7xl mx-auto px-6 py-4 relative">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500 via-pink-500 to-blue-500 rounded-2xl blur-md group-hover:blur-lg transition-all" />
                <div className="relative w-11 h-11 backdrop-blur-xl rounded-2xl bg-gradient-to-br from-purple-600/90 via-pink-600/90 via-orange-500/90 via-yellow-500/90 via-green-500/90 to-blue-600/90 flex items-center justify-center shadow-xl border-2 border-white/60 overflow-hidden">
                  <div className="absolute inset-0.5 rounded-2xl bg-gradient-to-br from-white/30 to-transparent pointer-events-none" />
                  <Zap className="w-6 h-6 text-white relative z-10" />
                </div>
              </div>

              <div className="leading-tight">
                <div className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  SynergyAI
                </div>
                <div className="text-xs text-slate-600 font-medium">Setup</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Link to={createPageUrl('Landing')}>
                <button className="group px-4 py-2 rounded-full backdrop-blur-xl bg-white/45 border-2 border-white/60 hover:bg-white/70 transition-all text-sm font-semibold inline-flex items-center gap-2 text-slate-700 shadow-lg overflow-hidden relative">
                  <div className="absolute inset-0.5 rounded-full bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
                  <Home className="w-4 h-4 relative z-10" />
                  <span className="relative z-10">Home</span>
                </button>
              </Link>

              {user?.onboarding_completed && (
                <Link to={createPageUrl('Dashboard')}>
                  <button className="group px-4 py-2 rounded-full backdrop-blur-xl bg-white/45 border-2 border-white/60 hover:bg-white/70 transition-all text-sm font-semibold inline-flex items-center gap-2 text-slate-700 shadow-lg overflow-hidden relative">
                    <div className="absolute inset-0.5 rounded-full bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
                    <LayoutDashboard className="w-4 h-4 relative z-10" />
                    <span className="relative z-10">Dashboard</span>
                  </button>
                </Link>
              )}

              {user ? (
                <button
                  onClick={() => base44.auth.logout()}
                  className="group relative px-4 py-2 rounded-full overflow-hidden shadow-lg"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-600 via-orange-500 via-yellow-500 via-green-500 to-blue-600 bg-[length:200%_100%] animate-gradient" />
                  <div className="absolute inset-0 backdrop-blur-sm bg-white/10" />
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
                  <div className="absolute inset-px rounded-full bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />
                  <span className="relative z-10 inline-flex items-center gap-2 text-sm font-semibold text-white drop-shadow-lg">
                    <LogOut className="w-4 h-4" />
                    Logout
                  </span>
                </button>
              ) : (
                <button
                  onClick={() => base44.auth.redirectToLogin(createPageUrl('Onboarding'))}
                  className="group relative px-4 py-2 rounded-full overflow-hidden shadow-lg"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-600 via-orange-500 via-yellow-500 via-green-500 to-blue-600 bg-[length:200%_100%] animate-gradient" />
                  <div className="absolute inset-0 backdrop-blur-sm bg-white/10" />
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
                  <div className="absolute inset-px rounded-full bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />
                  <span className="relative z-10 inline-flex items-center gap-2 text-sm font-semibold text-white drop-shadow-lg">
                    <LogIn className="w-4 h-4" />
                    Login
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 px-6 py-10">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-full mb-4 backdrop-blur-xl bg-gradient-to-r from-purple-100/80 to-pink-100/80 border border-white/60 shadow-lg relative overflow-hidden">
              <div className="absolute inset-px rounded-full bg-gradient-to-r from-white/40 to-transparent pointer-events-none" />
              <div className="w-2 h-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 animate-pulse relative z-10" />
              <span className="text-sm font-medium bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent relative z-10">
                AI-Powered Matchmaking Setup
              </span>
            </div>

            <h1 className="text-4xl md:text-5xl font-bold leading-tight">
              Let's personalize your{' '}
              <span className="bg-gradient-to-r from-purple-600 via-pink-600 via-orange-500 via-yellow-500 via-green-500 to-blue-600 bg-clip-text text-transparent animate-gradient bg-[length:200%_100%]">
                SynergyAI
              </span>{' '}
              experience
            </h1>
            <p className="mt-2 text-slate-600 text-lg max-w-3xl">{headerSubtitle}</p>

            <div className="mt-6 flex flex-wrap gap-3">
              <StepPill icon={Users} label="Select role" active={step === 'select-type'} />
              <StepPill icon={Rocket} label="Founder profile" active={step === 'founder-profile'} />
              <StepPill icon={Building2} label="Investor profile" active={step === 'investor-profile'} />
            </div>
          </div>

          <div className="grid lg:grid-cols-[380px_1fr] gap-8 items-start">
            <div className="space-y-6">
              <LiquidGlassCard gradient="from-purple-500 to-pink-500">
                <div className="p-7">
                  <div className="flex items-start gap-4">
                    <div className="relative">
                      <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-blue-500 rounded-2xl blur-lg opacity-40" />
                      <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-600/90 to-blue-600/90 border border-white/60 flex items-center justify-center shadow-lg">
                        <Sparkles className="w-6 h-6 text-white" />
                      </div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-slate-800">High-signal setup</div>
                      <div className="text-sm text-slate-600 mt-1">The more complete your profile, the better the matches.</div>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-white/60 bg-white/40 backdrop-blur-xl p-4">
                      <div className="text-xs text-slate-600">Account</div>
                      <div className="mt-1 text-sm font-semibold text-slate-800">{user?.email || user?.full_name || 'Signed in'}</div>
                    </div>
                    <div className="rounded-2xl border border-white/60 bg-white/40 backdrop-blur-xl p-4">
                      <div className="text-xs text-slate-600">Status</div>
                      <div className="mt-1 text-sm font-semibold text-slate-800">In progress</div>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center gap-2 text-sm text-slate-600">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>Secure. You can edit this later.</span>
                  </div>
                </div>
              </LiquidGlassCard>

              {step !== 'select-type' && (
                <LiquidGlassCard gradient="from-orange-500 to-yellow-500">
                  <div className="p-7">
                    <div className="text-sm font-semibold text-slate-800">Need to switch roles?</div>
                    <p className="text-sm text-slate-600 mt-1">You can go back and choose a different setup path.</p>
                    <Button variant="outline" className="mt-4 w-full" onClick={() => setStep('select-type')}>
                      Back to role selection
                    </Button>
                  </div>
                </LiquidGlassCard>
              )}
            </div>

            <div className="space-y-6">
              {step === 'select-type' && (
                <div className="grid md:grid-cols-2 gap-6">
                  <RoleCard
                    title="I'm a Founder"
                    subtitle="Raise capital faster with AI-powered investor matching."
                    icon={Rocket}
                    gradient="from-purple-500 via-pink-500 to-orange-500"
                    bullets={['AI-analyzed pitch decks', 'Smart investor matches', 'Deal room management', 'Engagement tracking']}
                    onClick={() => handleTypeSelect('founder')}
                  />

                  <RoleCard
                    title="I'm an Investor"
                    subtitle="Discover and evaluate deals with AI-driven insights."
                    icon={Building2}
                    gradient="from-blue-500 via-teal-500 to-green-500"
                    bullets={['Curated deal flow', 'AI startup matching', 'Due diligence tools', 'Portfolio analytics']}
                    onClick={() => handleTypeSelect('investor')}
                  />
                </div>
              )}

              {step === 'founder-profile' && (
                <LiquidGlassCard gradient="from-purple-500 via-pink-500 to-orange-500">
                  <div className="p-8 md:p-10">
                    <SectionHeader
                      icon={Rocket}
                      title="Founder profile"
                      description="The essentials to generate strong investor matches."
                      gradient="from-purple-500 via-pink-500 to-orange-500"
                    />

                    <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-5">
                      <Field label="First name *">
                        <Input value={formData.first_name} onChange={(e) => setFormData(p => ({ ...p, first_name: e.target.value }))} placeholder="John" />
                      </Field>
                      <Field label="Last name *">
                        <Input value={formData.last_name} onChange={(e) => setFormData(p => ({ ...p, last_name: e.target.value }))} placeholder="Doe" />
                      </Field>
                    </div>

                    <div className="mt-5">
                      <Field label="Company name *">
                        <Input value={formData.company_name} onChange={(e) => setFormData(p => ({ ...p, company_name: e.target.value }))} placeholder="Acme Inc" />
                      </Field>
                    </div>

                    <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
                      <Field label="Company website">
                        <Input value={formData.website} onChange={(e) => setFormData(p => ({ ...p, website: e.target.value }))} placeholder="https://acme.com" />
                      </Field>
                      <Field label="Portfolio URL">
                        <Input value={formData.portfolio_url} onChange={(e) => setFormData(p => ({ ...p, portfolio_url: e.target.value }))} placeholder="https://portfolio.acme.com" />
                      </Field>
                    </div>

                    <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
                      <Field label="Country">
                        <Select value={formData.country} onValueChange={handleCountryChange}>
                          <SelectTrigger className="bg-transparent border-0 px-0">
                            <SelectValue placeholder="Select country" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.keys(countriesWithStates).map(country => (
                              <SelectItem key={country} value={country}>{country}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="State/region">
                        <Select 
                          value={formData.city} 
                          onValueChange={(v) => setFormData(p => ({ ...p, city: v }))}
                          disabled={!formData.country}
                        >
                          <SelectTrigger className="bg-transparent border-0 px-0">
                            <SelectValue placeholder="Select state/region" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableStates.map(state => (
                              <SelectItem key={state} value={state}>{state}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>

                    <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
                      <Field label="LinkedIn URL">
                        <Input value={formData.linkedin_url} onChange={(e) => setFormData(p => ({ ...p, linkedin_url: e.target.value }))} placeholder="linkedin.com/in/yourprofile" />
                      </Field>
                      <Field label="Phone">
                        <Input value={formData.phone} onChange={(e) => setFormData(p => ({ ...p, phone: e.target.value }))} placeholder="+1 (555) 000-0000" />
                      </Field>
                    </div>

                    <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
                      <Field label="Current stage *">
                        <Select value={formData.stage} onValueChange={(v) => setFormData(p => ({ ...p, stage: v }))}>
                          <SelectTrigger className="bg-transparent border-0 px-0">
                            <SelectValue placeholder="Select your stage" />
                          </SelectTrigger>
                          <SelectContent>
                            {stages.map(stage => (
                              <SelectItem key={stage} value={stage}>{stage}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Team size">
                        <Input type="number" value={formData.team_size} onChange={(e) => setFormData(p => ({ ...p, team_size: e.target.value }))} placeholder="5" />
                      </Field>
                    </div>

                    <div className="mt-5">
                      <Field label="Pitch deck (optional)">
                        <input
                          type="file"
                          accept=".pdf,.ppt,.pptx"
                          onChange={async (e) => {
                            const file = e.target.files[0];
                            if (file) {
                              try {
                                const { file_url } = await base44.integrations.Core.UploadFile({ file });
                                setFormData({...formData, pitch_deck_url: file_url});
                                toast.success('Pitch deck uploaded');
                              } catch (error) {
                                toast.error('Upload failed');
                              }
                            }
                          }}
                          className="w-full text-sm text-slate-700 bg-transparent"
                        />
                        {formData.pitch_deck_url && (
                          <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            Pitch deck uploaded
                          </p>
                        )}
                      </Field>
                    </div>

                    <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-5">
                      <Field label="Target raise ($)">
                        <Input type="number" value={formData.amount_raising} onChange={(e) => setFormData(p => ({ ...p, amount_raising: e.target.value }))} placeholder="1000000" />
                      </Field>
                      <Field label="Soft cap ($)">
                        <Input type="number" value={formData.raise_min} onChange={(e) => setFormData(p => ({ ...p, raise_min: e.target.value }))} placeholder="500000" />
                      </Field>
                      <Field label="Hard cap ($)">
                        <Input type="number" value={formData.raise_max} onChange={(e) => setFormData(p => ({ ...p, raise_max: e.target.value }))} placeholder="2000000" />
                      </Field>
                    </div>

                    <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
                      <Field label="Industry *">
                        <Select value={formData.selected_industry} onValueChange={handleIndustryChange}>
                          <SelectTrigger className="bg-transparent border-0 px-0">
                            <SelectValue placeholder="Select industry" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.keys(industriesData).map(industry => (
                              <SelectItem key={industry} value={industry}>{industry}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Sector">
                        <Select 
                          value={formData.selected_sector} 
                          onValueChange={handleSectorChange}
                          disabled={!formData.selected_industry}
                        >
                          <SelectTrigger className="bg-transparent border-0 px-0">
                            <SelectValue placeholder="Select sector" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableSectors.map(sector => (
                              <SelectItem key={sector} value={sector}>{sector}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>

                    <div className="mt-5">
                      <Field label="Business model">
                        <Select value={formData.business_model} onValueChange={(v) => setFormData(p => ({ ...p, business_model: v }))}>
                          <SelectTrigger className="bg-transparent border-0 px-0">
                            <SelectValue placeholder="Select business model" />
                          </SelectTrigger>
                          <SelectContent>
                            {businessModels.map(model => (
                              <SelectItem key={model} value={model}>{model}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>

                    <div className="mt-5">
                      <Field label="Custom industry/tag (optional)">
                        <div className="flex gap-2">
                          <Input value={formData.custom_industry} onChange={(e) => setFormData(p => ({ ...p, custom_industry: e.target.value }))} placeholder="e.g., Quantum Computing" />
                          <Button variant="outline" onClick={handleCustomIndustryAdd}>
                            Add
                          </Button>
                        </div>
                        {formData.industries?.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {formData.industries.map((ind, i) => (
                              <Badge key={i} variant="secondary" className="gap-1">
                                {ind}
                                <button onClick={() => setFormData(prev => ({...prev, industries: prev.industries.filter((_, idx) => idx !== i)}))}>×</button>
                              </Badge>
                            ))}
                          </div>
                        )}
                      </Field>
                    </div>

                    <div className="mt-8 flex items-center justify-between gap-4">
                      <Button variant="outline" onClick={() => setStep('select-type')} className="border-white/70 bg-white/40 hover:bg-white/60">
                        Back
                      </Button>

                      <LiquidRainbowButton disabled={!isFounderValid} onClick={handleComplete}>
                        Complete setup
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                      </LiquidRainbowButton>
                    </div>
                  </div>
                </LiquidGlassCard>
              )}

              {step === 'investor-profile' && (
                <LiquidGlassCard gradient="from-blue-500 via-teal-500 to-green-500">
                  <div className="p-8 md:p-10">
                    <SectionHeader
                      icon={Building2}
                      title="Investor profile"
                      description="Define your focus areas for better deal flow and faster triage."
                      gradient="from-blue-500 via-teal-500 to-green-500"
                    />

                    <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-5">
                      <Field label="First name *">
                        <Input value={formData.first_name} onChange={(e) => setFormData(p => ({ ...p, first_name: e.target.value }))} placeholder="John" />
                      </Field>
                      <Field label="Last name *">
                        <Input value={formData.last_name} onChange={(e) => setFormData(p => ({ ...p, last_name: e.target.value }))} placeholder="Doe" />
                      </Field>
                    </div>

                    <div className="mt-5">
                      <Field label="Firm name *">
                        <div className="relative">
                          <Input
                            value={formData.company_name}
                            onChange={(e) => {
                              const value = e.target.value;
                              setFormData(p => ({ ...p, company_name: value }));
                              searchFirms(value);
                              setSelectedFirm(null);
                            }}
                            placeholder="Start typing to search..."
                          />
                          {searching && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                            </div>
                          )}
                          {matchingFirms.length > 0 && (
                            <div className="absolute top-full mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                              {matchingFirms.map((firm) => (
                                <button
                                  key={firm.id}
                                  onClick={() => handleFirmSelect(firm)}
                                  className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-0"
                                >
                                  <p className="font-medium text-slate-900">{firm.company_name}</p>
                                  {firm.firm_type && (
                                    <p className="text-xs text-slate-500">{firm.firm_type}</p>
                                  )}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {selectedFirm && (
                          <div className="mt-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-emerald-600" />
                            <span className="text-sm text-emerald-800">
                              Matched with existing firm: {selectedFirm.company_name}
                            </span>
                          </div>
                        )}
                      </Field>
                    </div>

                    <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
                      <Field label="Your role at firm *">
                        <Select value={formData.firm_role} onValueChange={(v) => setFormData(p => ({ ...p, firm_role: v }))}>
                          <SelectTrigger className="bg-transparent border-0 px-0">
                            <SelectValue placeholder="Select your role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Partner">Partner</SelectItem>
                            <SelectItem value="Managing Director">Managing Director</SelectItem>
                            <SelectItem value="Principal">Principal</SelectItem>
                            <SelectItem value="Associate">Associate</SelectItem>
                            <SelectItem value="Analyst">Analyst</SelectItem>
                            <SelectItem value="Venture Partner">Venture Partner</SelectItem>
                            <SelectItem value="Employee">Employee</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Your title (custom)">
                        <Input value={formData.job_title} onChange={(e) => setFormData(p => ({ ...p, job_title: e.target.value }))} placeholder="e.g., Senior Partner" />
                      </Field>
                    </div>

                    <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
                      <Field label="LinkedIn URL">
                        <Input value={formData.linkedin_url} onChange={(e) => setFormData(p => ({ ...p, linkedin_url: e.target.value }))} placeholder="linkedin.com/in/yourprofile" />
                      </Field>
                      <Field label="Phone">
                        <Input value={formData.phone} onChange={(e) => setFormData(p => ({ ...p, phone: e.target.value }))} placeholder="+1 (555) 000-0000" />
                      </Field>
                    </div>

                    <div className="mt-5">
                      <div className="flex items-center gap-2 text-slate-800 font-semibold mb-3">
                        <TrendingUp className="w-4 h-4" />
                        Investment stages *
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {stages.map(stage => (
                          <Badge
                            key={stage}
                            variant={formData.preferred_stages.includes(stage) ? "default" : "outline"}
                            className={`cursor-pointer ${formData.preferred_stages.includes(stage) && "bg-purple-600"}`}
                            onClick={() => toggleStage(stage)}
                          >
                            {stage}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="mt-5">
                      <div className="flex items-center gap-2 text-slate-800 font-semibold mb-3">
                        <Target className="w-4 h-4" />
                        Industry focus *
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {Object.keys(industriesData).map(industry => (
                          <Badge
                            key={industry}
                            variant={formData.industries.includes(industry) ? "default" : "outline"}
                            className={`cursor-pointer ${formData.industries.includes(industry) && "bg-purple-600"}`}
                            onClick={() => {
                              setFormData(prev => ({
                                ...prev,
                                industries: prev.industries.includes(industry)
                                  ? prev.industries.filter(i => i !== industry)
                                  : [...prev.industries, industry]
                              }));
                            }}
                          >
                            {industry}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="mt-5">
                      <div className="flex items-center gap-2 text-slate-800 font-semibold mb-3">
                        <DollarSign className="w-4 h-4" />
                        Check size range
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <Field label="Minimum ($)" compact>
                          <Input type="number" value={formData.check_size_min} onChange={(e) => setFormData(p => ({ ...p, check_size_min: e.target.value }))} placeholder="50000" />
                        </Field>
                        <Field label="Maximum ($)" compact>
                          <Input type="number" value={formData.check_size_max} onChange={(e) => setFormData(p => ({ ...p, check_size_max: e.target.value }))} placeholder="500000" />
                        </Field>
                      </div>
                    </div>

                    <div className="mt-5">
                      <Field label="Investment thesis / bio">
                        <Textarea value={formData.bio} onChange={(e) => setFormData(p => ({ ...p, bio: e.target.value }))} placeholder="Describe your investment approach and what you look for in startups..." rows={4} />
                      </Field>
                    </div>

                    <div className="mt-8 flex items-center justify-between gap-4">
                      <Button variant="outline" onClick={() => setStep('select-type')} className="border-white/70 bg-white/40 hover:bg-white/60">
                        Back
                      </Button>

                      <LiquidRainbowButton disabled={!isInvestorValid} onClick={handleComplete}>
                        Complete setup
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                      </LiquidRainbowButton>
                    </div>
                  </div>
                </LiquidGlassCard>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/60 py-10 px-6 backdrop-blur-xl bg-white/30 shadow-lg mt-16">
        <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-white/10 pointer-events-none" />
        <div className="max-w-7xl mx-auto relative flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-sm text-slate-600">© {new Date().getFullYear()} SynergyAI</div>
          <div className="text-sm text-slate-600 flex items-center gap-6">
            <a className="hover:text-purple-600 transition-colors" href="#">Privacy</a>
            <a className="hover:text-purple-600 transition-colors" href="#">Terms</a>
            <a className="hover:text-purple-600 transition-colors" href="#">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}