-- LOCAL TEST DATABASE ONLY; never apply to the live site.
INSERT INTO members (id,email,role,name) VALUES ('local_seedy','seedy@sites.test','teacher','本地演示教师') ON CONFLICT(id) DO NOTHING;
