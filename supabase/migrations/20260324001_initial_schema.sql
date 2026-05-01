-- CRM Inmobiliario Multi-Tenant Schema
-- Migrations para Supabase

-- =============================================================================
-- EXTENSIONES
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- ENUMS
-- =============================================================================

-- Roles de usuario dentro de un tenant
CREATE TYPE user_role AS ENUM (
  'admin',      -- Administrador del tenant: gestión completa
  'coordinator', -- Coordinador comercial: supervisa pipeline
  'agent'        -- Agente inmobiliario: gestiona sus propios leads
);

-- Estados del lead
CREATE TYPE lead_status AS ENUM (
  'new',           -- Lead nuevo recibido
  'contacted',     -- Primer contacto realizado
  'qualified',     -- Lead cualificado (tiene presupuesto)
  'visit',         -- Ha visitado una propiedad
  'negotiation',   -- En negociación
  'won',           -- Cerrado ganado (venta/alquiler)
  'lost'           -- Cerrado perdido
);

-- Tipos de propiedad
CREATE TYPE property_type AS ENUM (
  'apartment',   -- Apartamento
  'house',        -- Casa
  'penthouse',    -- Ático
  'villa',        -- Villa
  'office',       -- Oficina
  'commercial',   -- Local comercial
  'land',         -- Terreno
  'garage',       -- Garaje
  'storage'       -- Trastero
);

-- Tipo de operación
CREATE TYPE deal_type AS ENUM (
  'sale',     -- Venta
  'rent'      -- Alquiler
);

-- Estado de cita
CREATE TYPE appointment_status AS ENUM (
  'scheduled',   -- Programada
  'confirmed',    -- Confirmada
  'completed',    -- Completada
  'cancelled',    -- Cancelada
  'no_show'       -- No asistio
);

-- Tipo de interacción
CREATE TYPE interaction_type AS ENUM (
  'call',         -- Llamada telefónica
  'email',        -- Email
  'meeting',      -- Reunión presencial
  'whatsapp',     -- WhatsApp
  'note',         -- Nota interna
  'audio'         -- Audio/voz
);

-- =============================================================================
-- TABLAS CORE (Multi-Tenant)
-- =============================================================================

-- Tabla de Tenants (inmobiliarias)
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de usuarios con tenant_id
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  role user_role NOT NULL DEFAULT 'agent',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, email)
);

-- Index para queries rápidas por tenant
CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);

-- =============================================================================
-- TABLAS DE NEGOCIO
-- =============================================================================

-- Propiedades
CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  property_type property_type NOT NULL,
  deal_type deal_type NOT NULL,
  price DECIMAL(15, 2) NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'España',
  area_sqm DECIMAL(10, 2),
  rooms INTEGER,
  bathrooms INTEGER,
  parking INTEGER DEFAULT 0,
  features JSONB DEFAULT '[]',
  images JSONB DEFAULT '[]',
  status TEXT DEFAULT 'active', -- active, inactive, sold, rented
  agent_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_properties_tenant_id ON properties(tenant_id);
CREATE INDEX idx_properties_agent_id ON properties(agent_id);
CREATE INDEX idx_properties_status ON properties(status);
CREATE INDEX idx_properties_type ON properties(property_type);

-- Leads
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT,
  email TEXT,
  phone TEXT NOT NULL,
  source TEXT, -- web, referral, instagram, facebook, etc.
  budget_min DECIMAL(15, 2),
  budget_max DECIMAL(15, 2),
  preferred_location TEXT,
  preferred_type property_type,
  notes TEXT,
  status lead_status DEFAULT 'new',
  assigned_to UUID REFERENCES users(id),
  created_by UUID REFERENCES users(id),
  last_contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leads_tenant_id ON leads(tenant_id);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_assigned_to ON leads(assigned_to);

-- Relación leads-propiedades (muchos a muchos)
CREATE TABLE lead_properties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  interest_level INTEGER DEFAULT 3, -- 1-5, 5 = muy interesado
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lead_id, property_id)
);

CREATE INDEX idx_lead_properties_lead_id ON lead_properties(lead_id);
CREATE INDEX idx_lead_properties_property_id ON lead_properties(property_id);

-- Interacciones (historial de contacto)
CREATE TABLE interactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  type interaction_type NOT NULL,
  subject TEXT,
  content TEXT NOT NULL,
  audio_url TEXT, -- URL del audio si hay grabación
  transcription TEXT, -- Transcripción del audio
  outcome TEXT, -- Resultado de la interacción
  next_action TEXT, -- Acción a seguir
  next_action_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_interactions_tenant_id ON interactions(tenant_id);
CREATE INDEX idx_interactions_lead_id ON interactions(lead_id);
CREATE INDEX idx_interactions_user_id ON interactions(user_id);

-- Citas
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id), -- Agente responsable
  title TEXT NOT NULL,
  description TEXT,
  appointment_type TEXT NOT NULL, -- visit, meeting, call, etc.
  status appointment_status DEFAULT 'scheduled',
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  location TEXT,
  notes TEXT,
  reminder_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_appointments_tenant_id ON appointments(tenant_id);
CREATE INDEX idx_appointments_user_id ON appointments(user_id);
CREATE INDEX idx_appointments_start_time ON appointments(start_time);
CREATE INDEX idx_appointments_status ON appointments(status);

-- Tareas/Recordatorios
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium', -- low, medium, high
  due_date TIMESTAMPTZ,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tasks_tenant_id ON tasks(tenant_id);
CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);

-- =============================================================================
-- TRIGGERS PARA updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tenants_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER properties_updated_at BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER leads_updated_at BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER appointments_updated_at BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Helper: obtener tenant_id del usuario actual
CREATE OR REPLACE FUNCTION get_user_tenant_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT tenant_id 
    FROM users 
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- POLICIES RLS
-- =============================================================================

-- TENANTS: usuarios pueden ver/editar su propio tenant
CREATE POLICY "Users can view their tenant" ON tenants
  FOR SELECT USING (
    id IN (SELECT get_user_tenant_id())
  );

CREATE POLICY "Users can update their tenant" ON tenants
  FOR UPDATE USING (
    id IN (SELECT get_user_tenant_id())
  );

-- USERS: ver usuarios del mismo tenant
CREATE POLICY "Users can view users in their tenant" ON users
  FOR SELECT USING (
    tenant_id = get_user_tenant_id()
  );

CREATE POLICY "Admins can manage users in their tenant" ON users
  FOR ALL USING (
    tenant_id = get_user_tenant_id() 
    AND EXISTS (
      SELECT 1 FROM users u 
      WHERE u.id = auth.uid() 
      AND u.role = 'admin'
    )
  );

-- PROPERTIES: CRUD para miembros del tenant
CREATE POLICY "Users can CRUD properties in their tenant" ON properties
  FOR ALL USING (
    tenant_id = get_user_tenant_id()
  );

-- LEADS: CRUD para miembros del tenant
CREATE POLICY "Users can CRUD leads in their tenant" ON leads
  FOR ALL USING (
    tenant_id = get_user_tenant_id()
  );

-- LEAD_PROPERTIES: acceso por lead
CREATE POLICY "Users can access lead_properties in their tenant" ON lead_properties
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM leads l 
      WHERE l.id = lead_properties.lead_id 
      AND l.tenant_id = get_user_tenant_id()
    )
  );

-- INTERACTIONS: CRUD para miembros del tenant
CREATE POLICY "Users can CRUD interactions in their tenant" ON interactions
  FOR ALL USING (
    tenant_id = get_user_tenant_id()
  );

-- APPOINTMENTS: CRUD para miembros del tenant
CREATE POLICY "Users can CRUD appointments in their tenant" ON appointments
  FOR ALL USING (
    tenant_id = get_user_tenant_id()
  );

-- TASKS: ver/editar propias o del equipo
CREATE POLICY "Users can CRUD tasks in their tenant" ON tasks
  FOR ALL USING (
    tenant_id = get_user_tenant_id()
  );

-- =============================================================================
-- DATOS DE EJEMPLO (para testing)
-- =============================================================================

-- Insertar un tenant de ejemplo
INSERT INTO tenants (id, name, slug, settings) VALUES 
  ('00000000-0000-0000-0000-000000000001', 'Inmobiliaria Demo', 'demo-inmobiliaria', '{"theme": "blue"}');

-- NOTA: El usuario se creará automáticamente al registrarse via Auth
-- El trigger/función para crear el registro en 'users' debe configurarse
-- en Supabase Dashboard > Authentication > Twilio Functions o Edge Functions
