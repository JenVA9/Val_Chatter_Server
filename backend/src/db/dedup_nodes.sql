-- dedup_nodes.sql: Remove duplicate nodes created by running old schema.sql multiple times.
-- Run ONCE on an existing database before switching to the updated schema.sql.
-- Usage:  sudo mysql val_tactics < src/db/dedup_nodes.sql

USE val_tactics;

-- 1. Fix sites whose parent_id points to a duplicate map node — reroute to canonical map.
UPDATE nodes site_dup
  JOIN nodes map_dup   ON map_dup.id = site_dup.parent_id AND map_dup.type = 'map'
  JOIN nodes map_canon ON map_canon.type = 'map'
    AND map_canon.name = map_dup.name
    AND map_canon.id < map_dup.id
SET site_dup.parent_id = map_canon.id
WHERE site_dup.type = 'site';

-- 2. Re-point any thread_nodes that reference a duplicate to the canonical (lowest-id) node.
--    First delete rows that would cause PK conflict after the remap.
DELETE tn FROM thread_nodes tn
  JOIN nodes dup   ON dup.id = tn.node_id
  JOIN nodes canon ON canon.type = dup.type
    AND canon.name = dup.name
    AND (canon.parent_id = dup.parent_id OR (canon.parent_id IS NULL AND dup.parent_id IS NULL))
    AND canon.id < dup.id
WHERE EXISTS (
  SELECT 1 FROM (SELECT * FROM thread_nodes) tn2
  WHERE tn2.thread_id = tn.thread_id AND tn2.node_id = canon.id
);

UPDATE thread_nodes tn
  JOIN nodes dup   ON dup.id = tn.node_id
  JOIN nodes canon ON canon.type = dup.type
    AND canon.name = dup.name
    AND (canon.parent_id = dup.parent_id OR (canon.parent_id IS NULL AND dup.parent_id IS NULL))
    AND canon.id < dup.id
SET tn.node_id = canon.id;

-- 3. Delete the duplicate node rows (keep lowest id).
DELETE n1 FROM nodes n1
  JOIN nodes n2
    ON n1.type = n2.type
   AND n1.name = n2.name
   AND (n1.parent_id = n2.parent_id OR (n1.parent_id IS NULL AND n2.parent_id IS NULL))
   AND n1.id > n2.id;

SELECT CONCAT('Nodes remaining: ', COUNT(*)) AS result FROM nodes;
