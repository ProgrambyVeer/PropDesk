import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Skeleton } from './components/ui';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import Shell from './components/Shell';
import Dashboard from './pages/Dashboard';
import Search from './pages/Search';
import Properties from './pages/Properties';
import PropertyForm from './pages/PropertyForm';
import PropertyDetail from './pages/PropertyDetail';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import RequirementForm from './pages/RequirementForm';
import RequirementDetail from './pages/RequirementDetail';
import FollowUps from './pages/FollowUps';
import Deals from './pages/Deals';
import DealDetail from './pages/DealDetail';
import { Activity, Bin, Help, Notifications } from './pages/Misc';
import Analytics from './pages/Analytics';
import Profile from './pages/Profile';

export default function App() {
  const { user } = useAuth();
  if (user === null) return <div className="mx-auto max-w-md space-y-3 p-6"><Skeleton className="h-10" /><Skeleton className="h-32" /><Skeleton className="h-32" /></div>;
  if (!user) return <Routes><Route path="*" element={<Login />} /></Routes>;
  if (!user.onboarded) return <Onboarding />;
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/search" element={<Search />} />
        <Route path="/properties" element={<Properties />} />
        <Route path="/properties/new" element={<PropertyForm />} />
        <Route path="/properties/:id" element={<PropertyDetail />} />
        <Route path="/properties/:id/edit" element={<PropertyForm />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/clients/:id" element={<ClientDetail />} />
        <Route path="/requirements/new" element={<RequirementForm />} />
        <Route path="/requirements/:id" element={<RequirementDetail />} />
        <Route path="/requirements/:id/edit" element={<RequirementForm />} />
        <Route path="/follow-ups" element={<FollowUps />} />
        <Route path="/deals" element={<Deals />} />
        <Route path="/deals/:id" element={<DealDetail />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/bin" element={<Bin />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/company" element={<Profile section="company" />} />
        <Route path="/settings" element={<Profile section="settings" />} />
        <Route path="/help" element={<Help />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
