-- ============================================================
-- LIVELINE — 01_extensions.sql
-- Enable required PostgreSQL extensions
-- ============================================================

-- UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- pg_crypto for hashing utilities
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- PostGIS for geospatial queries on the live map
CREATE EXTENSION IF NOT EXISTS "postgis";

-- pg_trgm for fuzzy username/display name search
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
