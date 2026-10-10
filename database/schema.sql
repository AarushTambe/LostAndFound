
-- College Lost & Found
-- Initial PostgreSQL schema

CREATE TABLE IF NOT EXISTS users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user'
        CHECK (role IN ('user', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    type VARCHAR(10) NOT NULL
        CHECK (type IN ('lost', 'found')),
    title VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(60) NOT NULL,
    location VARCHAR(200) NOT NULL,
    item_date DATE NOT NULL,
    image_url TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'claimed', 'resolved')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS claims (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    item_id BIGINT NOT NULL REFERENCES items(id),
    claimant_id BIGINT NOT NULL REFERENCES users(id),
    message TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (item_id, claimant_id),
    CHECK (item_id > 0)
);

CREATE INDEX IF NOT EXISTS idx_items_type_status
    ON items(type, status);

CREATE INDEX IF NOT EXISTS idx_items_category
    ON items(category);

CREATE INDEX IF NOT EXISTS idx_items_user
    ON items(user_id);

CREATE INDEX IF NOT EXISTS idx_claims_item_status
    ON claims(item_id, status);

CREATE INDEX IF NOT EXISTS idx_claims_claimant
    ON claims(claimant_id);
