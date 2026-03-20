-- ============================================================
-- LIVELINE — 14_seed.sql
-- Seed data: interests catalogue + optional dev test data
-- ============================================================

-- ----------------------------------------------------------------
-- Interests
-- ----------------------------------------------------------------
INSERT INTO public.interests (name, slug, category) VALUES
-- Music
('Hip-Hop',         'hip-hop',          'music'),
('R&B',             'rnb',              'music'),
('Pop',             'pop',              'music'),
('Rock',            'rock',             'music'),
('Electronic',      'electronic',       'music'),
('Jazz',            'jazz',             'music'),
('Afrobeats',       'afrobeats',        'music'),
('Reggae',          'reggae',           'music'),
('Indie',           'indie',            'music'),
('Classical',       'classical',        'music'),
('Metal',           'metal',            'music'),
('Country',         'country',          'music'),
('Latin',           'latin',            'music'),
('K-Pop',           'k-pop',            'music'),
('Dancehall',       'dancehall',        'music'),
-- Sports
('Basketball',      'basketball',       'sports'),
('Football',        'football',         'sports'),
('Soccer',          'soccer',           'sports'),
('Tennis',          'tennis',           'sports'),
('Running',         'running',          'sports'),
('Gym / Fitness',   'gym-fitness',      'sports'),
('Skateboarding',   'skateboarding',    'sports'),
('Swimming',        'swimming',         'sports'),
('Cycling',         'cycling',          'sports'),
('Martial Arts',    'martial-arts',     'sports'),
-- Tech
('Gaming',          'gaming',           'tech'),
('Coding',          'coding',           'tech'),
('AI & Machine Learning', 'ai-ml',      'tech'),
('Crypto / Web3',   'crypto-web3',      'tech'),
('UI/UX Design',    'ui-ux-design',     'tech'),
-- Art & Culture
('Photography',     'photography',      'art'),
('Fashion',         'fashion',          'art'),
('Drawing / Art',   'drawing-art',      'art'),
('Film / Cinema',   'film-cinema',      'art'),
('Anime / Manga',   'anime-manga',      'art'),
('Street Art',      'street-art',       'art'),
('Dance',           'dance',            'art'),
-- Lifestyle
('Travel',          'travel',           'lifestyle'),
('Food',            'food',             'lifestyle'),
('Books',           'books',            'lifestyle'),
('Fitness',         'fitness',          'lifestyle'),
('Mental Health',   'mental-health',    'lifestyle'),
('Nature',          'nature',           'lifestyle'),
('Cars',            'cars',             'lifestyle'),
('Pets',            'pets',             'lifestyle')
ON CONFLICT (slug) DO NOTHING;

-- ----------------------------------------------------------------
-- DEV ONLY — Test users (comment out for production)
-- These assume Supabase auth users already exist.
-- Replace auth_id UUIDs with real ones from your auth.users table.
-- ----------------------------------------------------------------

/*
INSERT INTO public.users (auth_id, email, username, display_name, bio) VALUES
(
    '00000000-0000-0000-0000-000000000001',
    'alex@liveline.dev',
    'alex_dev',
    'Alex',
    'Testing the Liveline platform 🎵'
),
(
    '00000000-0000-0000-0000-000000000002',
    'jordan@liveline.dev',
    'jordan_dev',
    'Jordan',
    'Always on the move 📍'
);

-- Make them friends
INSERT INTO public.friendships (requester_id, addressee_id, status)
SELECT
    (SELECT id FROM public.users WHERE username = 'alex_dev'),
    (SELECT id FROM public.users WHERE username = 'jordan_dev'),
    'accepted';

-- Give them some interests
INSERT INTO public.user_interests (user_id, interest_id)
SELECT
    (SELECT id FROM public.users WHERE username = 'alex_dev'),
    id
FROM public.interests
WHERE slug IN ('hip-hop', 'coding', 'basketball');

-- Seed a music track
INSERT INTO public.music_activity (user_id, song, artist, cover_url, source, is_currently_playing)
VALUES (
    (SELECT id FROM public.users WHERE username = 'alex_dev'),
    'HUMBLE.',
    'Kendrick Lamar',
    'https://i.scdn.co/image/ab67616d0000b273e2e352d89826aef6dbd5ff8f',
    'spotify',
    TRUE
);
*/
