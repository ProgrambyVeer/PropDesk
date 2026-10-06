import { useState } from 'react';
import { Building2, CalendarCheck2, Handshake, Target } from 'lucide-react';
import { post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button } from '../components/ui';

const SLIDES = [
  { icon: Building2, title: 'Your Properties. Your Clients. One Place.', text: 'Every listing, every client and every requirement — organised and searchable in seconds.' },
  { icon: Target, title: 'Find the Right Property for Every Client.', text: 'Each requirement gets its own match score, so you always know what to pitch next.' },
  { icon: CalendarCheck2, title: 'Never Miss a Follow-up.', text: 'Calls, WhatsApps and site visits with reminders that move when your plans do.' },
  { icon: Handshake, title: 'Turn Opportunities Into Deals.', text: 'Track every deal from first call to registration, with commission calculated for you.' },
];

export default function Onboarding() {
  const { setUser } = useAuth();
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const finish = async () => { setBusy(true); try { setUser(await post('/auth/onboarding/complete')); } finally { setBusy(false); } };
  const S = SLIDES[i];
  return (
    <div className="flex min-h-screen flex-col bg-white px-6 pb-10 pt-6" data-testid="onboarding">
      <div className="flex justify-end"><button onClick={finish} className="text-sm font-semibold text-slate-500" data-testid="onboarding-skip-btn">Skip</button></div>
      <div key={i} className="mx-auto flex w-full max-w-md flex-1 animate-up flex-col justify-center">
        <div className="mb-10 flex h-24 w-24 items-center justify-center rounded-[28px] bg-navy text-white shadow-lift"><S.icon className="h-10 w-10" strokeWidth={1.6} /></div>
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl" data-testid="onboarding-title">{S.title}</h1>
        <p className="mt-4 text-base leading-relaxed text-slate-500">{S.text}</p>
      </div>
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex gap-2">{SLIDES.map((_, j) => <span key={j} className={`h-1.5 rounded-full transition-all ${j === i ? 'w-8 bg-navy' : 'w-1.5 bg-slate-200'}`} />)}</div>
        {i < SLIDES.length - 1
          ? <Button size="lg" className="w-full" onClick={() => setI(i + 1)} data-testid="onboarding-next-btn">Next</Button>
          : <Button size="lg" className="w-full" onClick={finish} loading={busy} data-testid="onboarding-get-started-btn">Get Started</Button>}
      </div>
    </div>
  );
}
