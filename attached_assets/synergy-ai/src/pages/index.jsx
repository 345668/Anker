import Layout from "./Layout.jsx";

import Dashboard from "./Dashboard";

import MyStartups from "./MyStartups";

import Matches from "./Matches";

import Outreach from "./Outreach";

import Investors from "./Investors";

import Contacts from "./Contacts";

import DataImport from "./DataImport";

import Templates from "./Templates";

import Search from "./Search";

import Profile from "./Profile";

import Settings from "./Settings";

import Pipeline from "./Pipeline";

import Analytics from "./Analytics";

import AllStartups from "./AllStartups";

import UserManagement from "./UserManagement";

import DealFlow from "./DealFlow";

import SavedStartups from "./SavedStartups";

import StartupProfile from "./StartupProfile";

import OutreachAnalytics from "./OutreachAnalytics";

import OutreachDetails from "./OutreachDetails";

import DealRooms from "./DealRooms";

import DealRoomDetails from "./DealRoomDetails";

import Onboarding from "./Onboarding";

import Networking from "./Networking";

import InvestorOnboarding from "./InvestorOnboarding";

import FundraisingDashboard from "./FundraisingDashboard";

import Companies from "./Companies";

import Landing from "./Landing";

import Calendar from "./Calendar";

import Admin from "./Admin";

import Documentation from "./Documentation";

import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';

const PAGES = {
    
    Dashboard: Dashboard,
    
    MyStartups: MyStartups,
    
    Matches: Matches,
    
    Outreach: Outreach,
    
    Investors: Investors,
    
    Contacts: Contacts,
    
    DataImport: DataImport,
    
    Templates: Templates,
    
    Search: Search,
    
    Profile: Profile,
    
    Settings: Settings,
    
    Pipeline: Pipeline,
    
    Analytics: Analytics,
    
    AllStartups: AllStartups,
    
    UserManagement: UserManagement,
    
    DealFlow: DealFlow,
    
    SavedStartups: SavedStartups,
    
    StartupProfile: StartupProfile,
    
    OutreachAnalytics: OutreachAnalytics,
    
    OutreachDetails: OutreachDetails,
    
    DealRooms: DealRooms,
    
    DealRoomDetails: DealRoomDetails,
    
    Onboarding: Onboarding,
    
    Networking: Networking,
    
    InvestorOnboarding: InvestorOnboarding,
    
    FundraisingDashboard: FundraisingDashboard,
    
    Companies: Companies,
    
    Landing: Landing,
    
    Calendar: Calendar,
    
    Admin: Admin,
    
    Documentation: Documentation,
    
}

function _getCurrentPage(url) {
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    let urlLastPart = url.split('/').pop();
    if (urlLastPart.includes('?')) {
        urlLastPart = urlLastPart.split('?')[0];
    }

    const pageName = Object.keys(PAGES).find(page => page.toLowerCase() === urlLastPart.toLowerCase());
    return pageName || Object.keys(PAGES)[0];
}

// Create a wrapper component that uses useLocation inside the Router context
function PagesContent() {
    const location = useLocation();
    const currentPage = _getCurrentPage(location.pathname);
    
    return (
        <Layout currentPageName={currentPage}>
            <Routes>            
                
                    <Route path="/" element={<Dashboard />} />
                
                
                <Route path="/Dashboard" element={<Dashboard />} />
                
                <Route path="/MyStartups" element={<MyStartups />} />
                
                <Route path="/Matches" element={<Matches />} />
                
                <Route path="/Outreach" element={<Outreach />} />
                
                <Route path="/Investors" element={<Investors />} />
                
                <Route path="/Contacts" element={<Contacts />} />
                
                <Route path="/DataImport" element={<DataImport />} />
                
                <Route path="/Templates" element={<Templates />} />
                
                <Route path="/Search" element={<Search />} />
                
                <Route path="/Profile" element={<Profile />} />
                
                <Route path="/Settings" element={<Settings />} />
                
                <Route path="/Pipeline" element={<Pipeline />} />
                
                <Route path="/Analytics" element={<Analytics />} />
                
                <Route path="/AllStartups" element={<AllStartups />} />
                
                <Route path="/UserManagement" element={<UserManagement />} />
                
                <Route path="/DealFlow" element={<DealFlow />} />
                
                <Route path="/SavedStartups" element={<SavedStartups />} />
                
                <Route path="/StartupProfile" element={<StartupProfile />} />
                
                <Route path="/OutreachAnalytics" element={<OutreachAnalytics />} />
                
                <Route path="/OutreachDetails" element={<OutreachDetails />} />
                
                <Route path="/DealRooms" element={<DealRooms />} />
                
                <Route path="/DealRoomDetails" element={<DealRoomDetails />} />
                
                <Route path="/Onboarding" element={<Onboarding />} />
                
                <Route path="/Networking" element={<Networking />} />
                
                <Route path="/InvestorOnboarding" element={<InvestorOnboarding />} />
                
                <Route path="/FundraisingDashboard" element={<FundraisingDashboard />} />
                
                <Route path="/Companies" element={<Companies />} />
                
                <Route path="/Landing" element={<Landing />} />
                
                <Route path="/Calendar" element={<Calendar />} />
                
                <Route path="/Admin" element={<Admin />} />
                
                <Route path="/Documentation" element={<Documentation />} />
                
            </Routes>
        </Layout>
    );
}

export default function Pages() {
    return (
        <Router>
            <PagesContent />
        </Router>
    );
}