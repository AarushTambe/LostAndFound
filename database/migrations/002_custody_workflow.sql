
BEGIN;

ALTER TABLE items
ADD COLUMN IF NOT EXISTS custody_status VARCHAR(30)
    NOT NULL DEFAULT 'not_applicable';

ALTER TABLE items
ADD COLUMN IF NOT EXISTS matched_item_id BIGINT
    REFERENCES items(id) ON DELETE SET NULL;

ALTER TABLE items
ADD CONSTRAINT items_custody_status_check
CHECK (
    custody_status IN (
        'not_applicable',
        'pending_handover',
        'in_custody',
        'released'
    )
);

ALTER TABLE items
ADD CONSTRAINT items_not_self_matched
CHECK (
    matched_item_id IS NULL OR matched_item_id <> id
);

-- Existing found reports require staff confirmation.
UPDATE items
SET custody_status = 'pending_handover'
WHERE type = 'found'
  AND custody_status = 'not_applicable';

-- Lost reports do not represent physical inventory.
UPDATE items
SET custody_status = 'not_applicable'
WHERE type = 'lost';

CREATE INDEX IF NOT EXISTS idx_items_matched_item
ON items(matched_item_id);

COMMIT;
