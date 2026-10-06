-- Admin audit records are append-only: block UPDATE and DELETE at the database level.
CREATE OR REPLACE FUNCTION prevent_audit_modification() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AdminAuditLog records are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER admin_audit_log_immutable
  BEFORE UPDATE OR DELETE ON "AdminAuditLog"
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();
