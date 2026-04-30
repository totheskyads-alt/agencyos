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
  ADD COLUMN IF NOT EXISTS task_type TEXT DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS all_day BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS meeting_link TEXT,
  ADD COLUMN IF NOT EXISTS call_note_template TEXT,
  ADD COLUMN IF NOT EXISTS recurrence_type TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS recurrence_interval INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS recurrence_weekdays SMALLINT[],
  ADD COLUMN IF NOT EXISTS recurrence_daily_mode TEXT DEFAULT 'interval',
  ADD COLUMN IF NOT EXISTS recurrence_end_type TEXT DEFAULT 'never',
  ADD COLUMN IF NOT EXISTS recurrence_until DATE,
  ADD COLUMN IF NOT EXISTS recurrence_monthly_mode TEXT DEFAULT 'day_of_month',
  ADD COLUMN IF NOT EXISTS recurrence_monthly_week TEXT,
  ADD COLUMN IF NOT EXISTS recurrence_monthly_weekday SMALLINT,
  ADD COLUMN IF NOT EXISTS recurrence_generated_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recurrence_origin_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_reminder_at ON tasks(reminder_at);
CREATE INDEX IF NOT EXISTS idx_tasks_starts_at ON tasks(starts_at);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_starts_at ON tasks(assigned_to, starts_at);
CREATE INDEX IF NOT EXISTS idx_tasks_project_starts_at ON tasks(project_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_tasks_recurrence_origin_task_id ON tasks(recurrence_origin_task_id);

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

UPDATE profiles
SET approval_status = COALESCE(approval_status, 'approved')
WHERE approval_status IS NULL;

UPDATE profiles
SET is_deleted = COALESCE(is_deleted, FALSE)
WHERE is_deleted IS NULL;

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
  INSERT INTO public.profiles (id, email, full_name, role, approval_status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'operator',
    'pending'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- Team moments: lightweight motivational messages shown in-app
CREATE TABLE IF NOT EXISTS team_moments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT,
  style TEXT DEFAULT 'motivation',
  is_active BOOLEAN DEFAULT TRUE,
  starts_at TIMESTAMPTZ DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_moments_active ON team_moments(is_active, starts_at DESC);

GRANT SELECT ON team_moments TO authenticated;
GRANT INSERT, UPDATE, DELETE ON team_moments TO authenticated;

ALTER TABLE team_moments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_moments_select_current" ON team_moments;
CREATE POLICY "team_moments_select_current" ON team_moments
  FOR SELECT
  USING (
    is_active = TRUE
    AND (starts_at IS NULL OR starts_at <= NOW())
    AND (ends_at IS NULL OR ends_at >= NOW())
  );

DROP POLICY IF EXISTS "team_moments_admin_insert" ON team_moments;
CREATE POLICY "team_moments_admin_insert" ON team_moments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND COALESCE(profiles.is_deleted, FALSE) = FALSE
    )
  );

DROP POLICY IF EXISTS "team_moments_admin_update" ON team_moments;
CREATE POLICY "team_moments_admin_update" ON team_moments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND COALESCE(profiles.is_deleted, FALSE) = FALSE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND COALESCE(profiles.is_deleted, FALSE) = FALSE
    )
  );

DROP POLICY IF EXISTS "team_moments_admin_delete" ON team_moments;
CREATE POLICY "team_moments_admin_delete" ON team_moments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND COALESCE(profiles.is_deleted, FALSE) = FALSE
    )
  );

CREATE TABLE IF NOT EXISTS team_moment_deliveries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_moment_id UUID REFERENCES team_moments(id) ON DELETE CASCADE,
  delivery_kind TEXT NOT NULL DEFAULT 'manual',
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  style TEXT,
  title TEXT NOT NULL,
  body TEXT,
  delivery_date DATE DEFAULT CURRENT_DATE,
  shown_at TIMESTAMPTZ DEFAULT NOW(),
  dismissed_at TIMESTAMPTZ,
  event_key TEXT UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_team_moment_deliveries_user_day
  ON team_moment_deliveries(user_id, delivery_date DESC, shown_at DESC);

GRANT SELECT, INSERT, UPDATE ON team_moment_deliveries TO authenticated;

ALTER TABLE team_moment_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_moment_deliveries_select_own_or_admin" ON team_moment_deliveries;
CREATE POLICY "team_moment_deliveries_select_own_or_admin" ON team_moment_deliveries
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND COALESCE(profiles.is_deleted, FALSE) = FALSE
    )
  );

DROP POLICY IF EXISTS "team_moment_deliveries_insert_own_or_admin" ON team_moment_deliveries;
CREATE POLICY "team_moment_deliveries_insert_own_or_admin" ON team_moment_deliveries
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND COALESCE(profiles.is_deleted, FALSE) = FALSE
    )
  );

DROP POLICY IF EXISTS "team_moment_deliveries_update_own_or_admin" ON team_moment_deliveries;
CREATE POLICY "team_moment_deliveries_update_own_or_admin" ON team_moment_deliveries
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND COALESCE(profiles.is_deleted, FALSE) = FALSE
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND COALESCE(profiles.is_deleted, FALSE) = FALSE
    )
  );

CREATE TABLE IF NOT EXISTS notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  color TEXT DEFAULT '#007AFF',
  tags TEXT[] DEFAULT '{}',
  reminder_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'text',
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS notes
  ALTER COLUMN project_id DROP NOT NULL,
  ALTER COLUMN title DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notes_project_status ON notes(project_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_creator_reminder ON notes(created_by, reminder_at);
CREATE INDEX IF NOT EXISTS idx_notes_task ON notes(task_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON notes TO authenticated;

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notes_select_visible_to_project_members" ON notes;
DROP POLICY IF EXISTS "notes_select_own_only" ON notes;
CREATE POLICY "notes_select_own_only" ON notes
  FOR SELECT
  USING (
    created_by = auth.uid()
  );

DROP POLICY IF EXISTS "notes_insert_visible_to_project_members" ON notes;
DROP POLICY IF EXISTS "notes_insert_own_only" ON notes;
CREATE POLICY "notes_insert_own_only" ON notes
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND (
      notes.project_id IS NULL
      OR
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
          AND profiles.role = 'admin'
          AND COALESCE(profiles.is_deleted, FALSE) = FALSE
      )
      OR EXISTS (
        SELECT 1 FROM project_members
        WHERE project_members.project_id = notes.project_id
          AND project_members.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "notes_update_visible_to_project_members" ON notes;
DROP POLICY IF EXISTS "notes_update_own_only" ON notes;
CREATE POLICY "notes_update_own_only" ON notes
  FOR UPDATE
  USING (
    created_by = auth.uid()
  )
  WITH CHECK (
    created_by = auth.uid()
  );

DROP POLICY IF EXISTS "notes_delete_visible_to_project_members" ON notes;
DROP POLICY IF EXISTS "notes_delete_own_only" ON notes;
CREATE POLICY "notes_delete_own_only" ON notes
  FOR DELETE
  USING (
    created_by = auth.uid()
  );

ALTER TABLE IF EXISTS leads
  ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_note TEXT,
  ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 9999;

CREATE INDEX IF NOT EXISTS idx_leads_reminder_at ON leads(reminder_at);
CREATE INDEX IF NOT EXISTS idx_leads_stage_position ON leads(stage, position);

-- Set the first user as admin (optional)
-- UPDATE profiles SET role = 'admin' WHERE email = 'your-email@gmail.com';
