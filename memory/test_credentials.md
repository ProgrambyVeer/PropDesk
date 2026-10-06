# Test Credentials

## PC App (phone + OTP only) — https://<preview>/  
- PC A: phone `9876543210` (Arjun Rao, Rao Realty) — OTP `123456` (mock provider, shown on screen)
- PC B: phone `9123456780` (Priya Nair, Nair Estates) — OTP `123456`
- Any other valid Indian mobile (starts 6-9, 10 digits) self-registers and sees onboarding slides.

## Super Admin App (email + password) — https://<preview>/admin/
- SUPER_ADMIN: `crazycoder117@gmail.com` / `Admin@12345`
- ADMIN: `ops.admin@propcrm.local` / `Admin@12345`
- SUPPORT_ADMIN: `support@propcrm.local` / `Admin@12345`
- READ_ONLY_ADMIN: `viewer@propcrm.local` / `Admin@12345`

## API
- Base: `<REACT_APP_BACKEND_URL>/api/v1` ; PC: /auth/send-otp, /auth/verify-otp ; Admin: /admin/auth/login
- Bearer token in `Authorization` header.
