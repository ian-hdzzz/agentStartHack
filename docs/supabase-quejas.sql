-- ============================================
-- Supabase: tabla quejas (app + agente WaterHub)
-- Ejecutar en SQL Editor de tu proyecto Supabase
-- ============================================

-- Enum de tipos (igual que en la app). Si ya existe, se ignora.
DO $$ BEGIN
  CREATE TYPE tipo_queja AS ENUM ('sin_agua', 'fuga', 'agua_contaminada', 'baja_presion', 'otro');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Tabla quejas (tweets + reportes del agente)
CREATE TABLE IF NOT EXISTS quejas (
  id SERIAL PRIMARY KEY,
  tweet_id VARCHAR(50) UNIQUE,
  texto TEXT NOT NULL,
  tipo tipo_queja DEFAULT 'otro',
  username VARCHAR(100),
  user_name VARCHAR(200),
  user_followers INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  retweets INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
  latitud DOUBLE PRECISION,
  longitud DOUBLE PRECISION,
  alcaldia VARCHAR(100),
  colonia VARCHAR(100),
  tweet_url TEXT,
  tweet_created_at TIMESTAMP WITH TIME ZONE,
  is_reply BOOLEAN DEFAULT FALSE,
  in_reply_to VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_quejas_tipo ON quejas(tipo);
CREATE INDEX IF NOT EXISTS idx_quejas_alcaldia ON quejas(alcaldia);
CREATE INDEX IF NOT EXISTS idx_quejas_latitud ON quejas(latitud) WHERE latitud IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quejas_created ON quejas(created_at DESC);

-- RLS
ALTER TABLE quejas ENABLE ROW LEVEL SECURITY;

-- Lectura pública (para que la app pinte el mapa)
DROP POLICY IF EXISTS "Public read access" ON quejas;
CREATE POLICY "Public read access" ON quejas FOR SELECT USING (true);

-- Inserción con anon key (para que el agente guarde reportes)
DROP POLICY IF EXISTS "Allow insert for agent" ON quejas;
CREATE POLICY "Allow insert for agent" ON quejas FOR INSERT WITH CHECK (true);
