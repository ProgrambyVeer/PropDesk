import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { ApiError, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Field, Input } from '../components/ui';
import { Logo } from '../components/Shell';

export default function Login() {
  const { login } = useAuth();
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [timer, setTimer] = useState(0);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => { if (timer > 0) { const t = setTimeout(() => setTimer(timer - 1), 1000); return () => clearTimeout(t); } }, [timer]);

  const send = async () => {
    setError('');
    if (!/^[6-9]\d{9}$/.test(phone)) return setError('Enter a valid 10-digit mobile number');
    setBusy(true);
    try {
      const r = await post('/auth/send-otp', { phone });
      setDevCode(r.devCode ?? null); setStep('otp'); setTimer(30); setOtp(['', '', '', '', '', '']);
      setTimeout(() => refs.current[0]?.focus(), 50);
    } catch (e) { setError((e as ApiError).message); } finally { setBusy(false); }
  };
  const verify = async (code = otp.join('')) => {
    if (code.length !== 6 || busy) return;
    setBusy(true); setError('');
    try {
      const r = await post('/auth/verify-otp', { phone, code });
      if (!r.showOnboarding) toast.success(`Welcome back${r.user.name ? `, ${r.user.name.split(' ')[0]}` : ''}!`, { description: 'Here is what needs your attention today.' });
      login(r.token, r.user);
    } catch (e) { setError((e as ApiError).fieldErrors?.code || (e as ApiError).message); } finally { setBusy(false); }
  };
  const setDigit = (i: number, v: string) => {
    const digits = v.replace(/\D/g, '');
    if (digits.length > 1) { const arr = digits.slice(0, 6).split(''); const next = [...otp]; arr.forEach((d, j) => { if (i + j < 6) next[i + j] = d; }); setOtp(next); if (next.join('').length === 6) verify(next.join('')); return; }
    const next = [...otp]; next[i] = digits; setOtp(next);
    if (digits && i < 5) refs.current[i + 1]?.focus();
    if (next.join('').length === 6) verify(next.join(''));
  };

  return (
    <div className="flex min-h-screen flex-col bg-white lg:flex-row">
      <div className="relative hidden flex-1 overflow-hidden bg-navy lg:block">
        <img src="https://images.unsplash.com/photo-1600555179901-107bf80d25cf?w=1400&q=80" alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
        <div className="relative flex h-full flex-col justify-end p-14 text-white">
          <p className="text-sm font-semibold uppercase tracking-[.2em] text-blue-200">For property consultants</p>
          <h1 className="mt-3 max-w-md text-5xl font-extrabold leading-tight tracking-tight">Your properties. Your clients. One place.</h1>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm animate-up">
          <Logo />
          {step === 'phone' ? (
            <>
              <h1 className="mt-10 text-3xl font-extrabold tracking-tight">Log in with your phone</h1>
              <p className="mt-2 text-sm text-slate-500">We'll send a one-time password to verify it's you.</p>
              <Field label="Phone Number" required error={error} className="mt-8">
                <div className="flex gap-2">
                  <span className="flex h-12 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-600">+91</span>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="98765 43210" inputMode="numeric" autoFocus className="h-12 text-base tracking-wide" data-testid="login-phone-input" invalid={!!error} />
                </div>
              </Field>
              <Button size="lg" className="mt-6 w-full" onClick={send} loading={busy} data-testid="login-send-otp-btn">Send OTP</Button>
            </>
          ) : (
            <>
              <button onClick={() => setStep('phone')} className="mt-8 flex items-center gap-1 text-sm font-semibold text-slate-500" data-testid="login-change-number-btn"><ArrowLeft className="h-4 w-4" />Change number</button>
              <h1 className="mt-4 text-3xl font-extrabold tracking-tight">Verify OTP</h1>
              <p className="mt-2 text-sm text-slate-500">Enter the 6-digit code sent to <b className="text-navy">+91 {phone}</b></p>
              {devCode && <p className="mt-4 rounded-xl bg-brand-50 px-3 py-2 text-xs font-medium text-brand-600" data-testid="dev-otp-hint">Development mode — use OTP <b className="font-mono">{devCode}</b></p>}
              <div className="mt-6 flex justify-between gap-2" data-testid="otp-inputs">
                {otp.map((d, i) => (
                  <input key={i} ref={(el) => { refs.current[i] = el; }} value={d} inputMode="numeric" maxLength={6} data-testid={`otp-digit-${i}`}
                    onChange={(e) => setDigit(i, e.target.value)} onKeyDown={(e) => e.key === 'Backspace' && !d && i > 0 && refs.current[i - 1]?.focus()}
                    className="h-14 w-12 rounded-xl border border-slate-200 text-center font-mono text-xl font-semibold focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand-100" />
                ))}
              </div>
              {error && <p className="mt-3 text-sm font-medium text-red-600" data-testid="login-error">{error}</p>}
              <Button size="lg" className="mt-6 w-full" onClick={() => verify()} loading={busy} disabled={otp.join('').length !== 6} data-testid="login-verify-otp-btn">Verify OTP</Button>
              <button disabled={timer > 0 || busy} onClick={send} className="mt-4 w-full text-center text-sm font-semibold text-brand disabled:text-slate-400" data-testid="login-resend-otp-btn">{timer > 0 ? `Resend OTP in ${timer}s` : 'Resend OTP'}</button>
            </>
          )}
          <p className="mt-10 flex items-center gap-2 text-xs text-slate-400"><ShieldCheck className="h-4 w-4" />Secured with one-time passwords. No passwords to remember.</p>
        </div>
      </div>
    </div>
  );
}
