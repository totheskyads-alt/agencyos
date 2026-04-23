-- ============================================================
-- Agency OS v2 - Migration SQL
-- Run in Supabase SQL Editor -> New Query -> Run
-- ============================================================

-- Assign users to projects (Access & Ownership)
CREATE TABLE IF NOT EXISTS project_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_on_project TEXT DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON project_members TO authenticated;

ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_members_admin_all" ON project_members;
CREATE POLICY "project_members_admin_all" ON project_members
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "project_members_read_own" ON project_members;
CREATE POLICY "project_members_read_own" ON project_members
  FOR SELECT
  USING (user_id = auth.uid());

-- Notification Center
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  entity_type TEXT,
  entity_id UUID,
  entity_url TEXT,
  event_key TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, event_key)
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read_at ON notifications(read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON notifications TO authenticated;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_read_own_or_admin" ON notifications;
CREATE POLICY "notifications_read_own_or_admin" ON notifications
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "notifications_insert_allowed" ON notifications;
CREATE POLICY "notifications_insert_allowed" ON notifications
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "notifications_update_own_or_admin" ON notifications;
CREATE POLICY "notifications_update_own_or_admin" ON notifications
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- Add new fields to existing tables
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS monthly_budget DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'direct';

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(10,2);

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS task_type TEXT DEFAULT 'general';

-- Invoices: internal calculations in EUR, issuing in the selected currency
ALTER TABLE billing
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invoice_currency TEXT DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(12,6) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS subtotal_amount DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS display_amount DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS tax_amount_eur DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS tax_amount_display DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoice_description TEXT,
  ADD COLUMN IF NOT EXISTS issuer_name TEXT,
  ADD COLUMN IF NOT EXISTS issuer_details TEXT,
  ADD COLUMN IF NOT EXISTS client_billing_details TEXT;

ALTER TABLE bugs
  ADD COLUMN IF NOT EXISTS screenshot_name TEXT,
  ADD COLUMN IF NOT EXISTS screenshot_url TEXT,
  ADD COLUMN IF NOT EXISTS screenshot_type TEXT;

UPDATE billing
SET
  invoice_currency = COALESCE(invoice_currency, 'EUR'),
  exchange_rate = COALESCE(exchange_rate, 1),
  subtotal_amount = COALESCE(subtotal_amount, amount),
  tax_amount_eur = COALESCE(tax_amount_eur, 0),
  tax_amount_display = COALESCE(tax_amount_display, 0),
  display_amount = COALESCE(display_amount, amount)
WHERE invoice_currency IS NULL
   OR exchange_rate IS NULL
   OR subtotal_amount IS NULL
   OR tax_amount_eur IS NULL
   OR tax_amount_display IS NULL
   OR display_amount IS NULL;

-- Update trigger for new profiles (fix)
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

-- Set the first user as admin (optional)
-- UPDATE profiles SET role = 'admin' WHERE email = 'your-email@gmail.com';
