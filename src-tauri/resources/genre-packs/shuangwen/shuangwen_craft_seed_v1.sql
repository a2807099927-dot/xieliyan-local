-- ============================================================
-- 无脑爽文模式 craft seed（占位文件，实际提示词在 profile 的 shuangwen_prompt 字段）
-- ============================================================

PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS craft_patterns (
  id TEXT PRIMARY KEY,
  genre TEXT NOT NULL,
  pattern_type TEXT NOT NULL,
  pattern_name TEXT NOT NULL,
  frequency TEXT,
  trigger_condition_json TEXT NOT NULL DEFAULT '[]',
  templates_json TEXT NOT NULL DEFAULT '[]',
  forbidden_json TEXT NOT NULL DEFAULT '[]',
  conflict_signals_json TEXT NOT NULL DEFAULT '{}',
  examples_json TEXT NOT NULL DEFAULT '{}',
  rule_summary TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'seed',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_craft_genre_type
  ON craft_patterns(genre, pattern_type);
