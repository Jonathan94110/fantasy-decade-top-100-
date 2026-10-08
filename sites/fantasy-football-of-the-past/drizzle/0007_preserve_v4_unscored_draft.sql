CREATE TRIGGER `backup_demo_v4_before_scoring_unification` BEFORE UPDATE OF state ON `demo_drafts`
WHEN json_extract(OLD.state,'$.scoring.version') = 4
 AND json_extract(OLD.state,'$.scoring.mode') IS NULL
 AND json_extract(NEW.state,'$.scoring.mode') = 'historical'
 AND json_extract(OLD.state,'$.status') = 'draft'
 AND json_extract(OLD.state,'$.season') IS NULL
BEGIN
 INSERT INTO `demo_scoring_backups` (`id`,`owner_id`,`draft_id`,`source_revision`,`state`,`source_updated_at`,`created_at`)
 VALUES (lower(hex(randomblob(16))),OLD.owner_id,OLD.id,OLD.revision,OLD.state,OLD.updated_at,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
