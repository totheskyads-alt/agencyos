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
