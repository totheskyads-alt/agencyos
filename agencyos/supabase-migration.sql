-- ============================================================
-- Agency OS v2 - Migration SQL
-- Rulează în Supabase SQL Editor → New Query → Run
-- ============================================================

-- Adaugă câmpuri noi la tabelele existente
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS monthly_budget DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'direct';

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(10,2);

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS task_type TEXT DEFAULT 'general';

-- Facturi: calcul intern in EUR, emitere in valuta aleasa
ALTER TABLE billing
  ADD COLUMN IF NOT EXISTS invoice_currency TEXT DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(12,6) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS display_amount DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoice_description TEXT,
  ADD COLUMN IF NOT EXISTS issuer_name TEXT,
  ADD COLUMN IF NOT EXISTS issuer_details TEXT,
  ADD COLUMN IF NOT EXISTS client_billing_details TEXT;

UPDATE billing
SET
  invoice_currency = COALESCE(invoice_currency, 'EUR'),
  exchange_rate = COALESCE(exchange_rate, 1),
  display_amount = COALESCE(display_amount, amount)
WHERE invoice_currency IS NULL
   OR exchange_rate IS NULL
   OR display_amount IS NULL;

-- Update trigger pentru profil nou (fix)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'operator'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- Setează primul utilizator ca admin (opțional)
-- UPDATE profiles SET role = 'admin' WHERE email = 'email-ul-tau@gmail.com';
