import { describe, it, expect } from 'vitest';
import { loadGenrePackFromText, indexGenrePacks } from '../src/Agent/genrePackLoader';

// ─── loadGenrePackFromText ────────────────────────────────────────────────────

describe('loadGenrePackFromText', () => {
  it('加载最小 profile JSON', () => {
    const profile = JSON.stringify({
      genre: 'dushi',
      display_name: '都市',
      style_profile: { tone: '热血' },
    });
    const seed = ''; // 空 SQL
    const pack = loadGenrePackFromText(profile, seed);
    expect(pack.genre).toBe('urban');
    expect(pack.profile.displayName).toBe('都市');
    expect(pack.profile.styleProfile.tone).toBe('热血');
  });

  it('reflectorThreshold 使用默认值', () => {
    const profile = JSON.stringify({ genre: 'dushi' });
    const pack = loadGenrePackFromText(profile, '');
    expect(pack.profile.reflectorThreshold.passTotal).toBe(18);
    expect(pack.profile.reflectorThreshold.maxTotal).toBe(25);
  });

  it('bannedWords 正确解析', () => {
    const profile = JSON.stringify({
      genre: 'dushi',
      style_profile: { banned_words: ['卧槽', '我靠'] },
    });
    const pack = loadGenrePackFromText(profile, '');
    expect(pack.profile.styleProfile.bannedWords).toEqual(['卧槽', '我靠']);
  });

  it('conflict_signals 正确解析', () => {
    const profile = JSON.stringify({
      genre: 'dushi',
      conflict_signals: { undercurrent: ['暗流'], open_conflict: ['冲突'] },
    });
    const pack = loadGenrePackFromText(profile, '');
    expect(pack.profile.conflictSignals.undercurrent).toContain('暗流');
  });

  it('craft_fingerprint 正确解析', () => {
    const profile = JSON.stringify({
      genre: 'dushi',
      craft_fingerprint: { dialogue_style: '短促有力' },
    });
    const pack = loadGenrePackFromText(profile, '');
    expect(pack.profile.craftFingerprint.dialogue_style).toBe('短促有力');
  });

  it('shuangwen_prompt 保留', () => {
    const profile = JSON.stringify({
      genre: 'dushi',
      shuangwen_prompt: '你是爽文写手',
    });
    const pack = loadGenrePackFromText(profile, '');
    expect(pack.profile.shuangwenPrompt).toBe('你是爽文写手');
  });

  it('xuanhuan 保持独立', () => {
    const profile = JSON.stringify({ genre: 'xuanhuan' });
    const pack = loadGenrePackFromText(profile, '');
    expect(pack.genre).toBe('xuanhuan');
  });

  it('youxi 保持独立', () => {
    const profile = JSON.stringify({ genre: 'youxi' });
    const pack = loadGenrePackFromText(profile, '');
    expect(pack.genre).toBe('youxi');
  });
});

// ─── indexGenrePacks ──────────────────────────────────────────────────────────

describe('indexGenrePacks', () => {
  it('按 genre 索引', () => {
    const packA = loadGenrePackFromText(JSON.stringify({ genre: 'urban', display_name: 'A' }), '');
    const packB = loadGenrePackFromText(JSON.stringify({ genre: 'youxi', display_name: 'B' }), '');
    const index = indexGenrePacks([packA, packB]);
    expect(index.get('urban')?.profile.displayName).toBe('A');
    expect(index.get('youxi')?.profile.displayName).toBe('B');
    expect(index.size).toBe(2);
  });

  it('空列表返回空 Map', () => {
    const index = indexGenrePacks([]);
    expect(index.size).toBe(0);
  });
});
