-- ============================================================
-- LIVELINE — 07_locations.sql
-- Live map — real-time user locations (PostGIS enabled)
-- ============================================================

CREATE TABLE public.locations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- Standard lat/lng columns (kept for simple queries / non-PostGIS clients)
    latitude        DOUBLE PRECISION NOT NULL
                        CHECK (latitude  BETWEEN -90  AND  90),
    longitude       DOUBLE PRECISION NOT NULL
                        CHECK (longitude BETWEEN -180 AND 180),

    -- PostGIS geometry point (EPSG:4326 — WGS84)
    geom            GEOGRAPHY(POINT, 4326)
                        GENERATED ALWAYS AS (
                            ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
                        ) STORED,

    accuracy_meters REAL,  -- GPS accuracy from device

    -- Activity context shown on the map marker
    activity_status TEXT CHECK (length(activity_status) <= 80),

    visibility      TEXT NOT NULL DEFAULT 'friends'
                        CHECK (visibility IN ('public', 'friends', 'private')),

    last_updated    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one location record per user
CREATE UNIQUE INDEX idx_locations_user_id ON public.locations (user_id);

-- Spatial index for radius queries
CREATE INDEX idx_locations_geom ON public.locations USING GIST (geom);

CREATE INDEX idx_locations_visibility ON public.locations (visibility);

-- ----------------------------------------------------------------
-- Location history (throttled — used for activity timeline)
-- ----------------------------------------------------------------
CREATE TABLE public.location_history (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    latitude    DOUBLE PRECISION NOT NULL,
    longitude   DOUBLE PRECISION NOT NULL,
    geom        GEOGRAPHY(POINT, 4326),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_location_history_user_id    ON public.location_history (user_id);
CREATE INDEX idx_location_history_recorded   ON public.location_history (recorded_at DESC);
CREATE INDEX idx_location_history_geom       ON public.location_history USING GIST (geom);

-- Auto-populate geom on history insert
CREATE OR REPLACE FUNCTION set_location_history_geom()
RETURNS TRIGGER AS $$
BEGIN
    NEW.geom := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_location_history_geom
    BEFORE INSERT OR UPDATE ON public.location_history
    FOR EACH ROW EXECUTE FUNCTION set_location_history_geom();

-- ----------------------------------------------------------------
-- Helper: upsert current location (called from backend on each
--         throttled location push from the mobile client)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION upsert_user_location(
    p_user_id       UUID,
    p_latitude      DOUBLE PRECISION,
    p_longitude     DOUBLE PRECISION,
    p_accuracy      REAL DEFAULT NULL,
    p_status        TEXT DEFAULT NULL,
    p_visibility    TEXT DEFAULT 'friends'
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.locations (user_id, latitude, longitude, accuracy_meters, activity_status, visibility, last_updated)
    VALUES (p_user_id, p_latitude, p_longitude, p_accuracy, p_status, p_visibility, NOW())
    ON CONFLICT (user_id) DO UPDATE
        SET latitude        = EXCLUDED.latitude,
            longitude       = EXCLUDED.longitude,
            accuracy_meters = EXCLUDED.accuracy_meters,
            activity_status = COALESCE(EXCLUDED.activity_status, locations.activity_status),
            visibility      = EXCLUDED.visibility,
            last_updated    = NOW();
END;
$$ LANGUAGE plpgsql;
