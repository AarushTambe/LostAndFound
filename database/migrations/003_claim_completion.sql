
BEGIN;

ALTER TABLE claims
DROP CONSTRAINT IF EXISTS claims_status_check;

ALTER TABLE claims
ADD CONSTRAINT claims_status_check
CHECK (status IN ('pending', 'approved', 'rejected', 'completed'));

COMMIT;
