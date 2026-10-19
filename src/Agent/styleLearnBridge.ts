// 模块说明：监听用户改稿，对比最近 Agent 草稿并提炼风格偏好（待确认）。
// 不自动弹窗 UI；通过 CustomEvent 抛出候选偏好，面板可订阅确认。

import { learnFromUserEdit } from './userPreferenceStore';
import { buildPreferenceConfirmationQuestion } from './userPreference';
import type { UserStylePreference } from '../types';

type DraftCache = { bookId: string; chapterId: string; draft: string; at: number };

let lastDraft: DraftCache | null = null;
let installed = false;

function htmlToPlain(html: string): string {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

export function rememberAgentDraft(detail: DraftCache): void {
  if (!detail?.draft?.trim()) return;
  lastDraft = { ...detail, at: detail.at || Date.now() };
}

/** 用户保存/粘贴改写后调用：若与最近草稿足够像且有差异，则学习 */
export async function maybeLearnFromChapterEdit(input: {
  bookId: string;
  chapterId: string;
  currentHtmlOrText: string;
}): Promise<UserStylePreference[]> {
  if (!lastDraft) return [];
  if (lastDraft.bookId !== input.bookId || lastDraft.chapterId !== input.chapterId) return [];
  // 10 分钟内有效
  if (Date.now() - lastDraft.at > 10 * 60 * 1000) return [];

  const original = htmlToPlain(lastDraft.draft);
  const edited = htmlToPlain(input.currentHtmlOrText);
  if (!original || !edited) return [];
  if (original === edited) return [];
  // 改动太小忽略
  if (Math.abs(original.length - edited.length) < 12 && original.slice(0, 80) === edited.slice(0, 80)) return [];

  try {
    const prefs = await learnFromUserEdit(input.bookId, original, edited);
    if (prefs.length) {
      const questions = prefs.map((p) => ({
        id: p.id,
        question: buildPreferenceConfirmationQuestion(p),
        preference: p
      }));
      window.dispatchEvent(
        new CustomEvent('writerzen:style-preference-suggestions', {
          detail: { bookId: input.bookId, suggestions: questions }
        })
      );
    }
    // 一稿只学一次，避免重复
    lastDraft = null;
    return prefs;
  } catch {
    return [];
  }
}

export function installStyleLearnListeners(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('writerzen:agent-draft-produced', ((ev: Event) => {
    const detail = (ev as CustomEvent).detail as DraftCache;
    if (detail) rememberAgentDraft(detail);
  }) as EventListener);

  // 章节内容被用户侧触发“学习检查”
  window.addEventListener('writerzen:chapter-edit-learn', ((ev: Event) => {
    const detail = (ev as CustomEvent).detail as {
      bookId: string;
      chapterId: string;
      content: string;
    };
    if (!detail?.bookId || !detail?.chapterId) return;
    void maybeLearnFromChapterEdit({
      bookId: detail.bookId,
      chapterId: detail.chapterId,
      currentHtmlOrText: detail.content || ''
    });
  }) as EventListener);
}

// 自动安装（渲染进程）
if (typeof window !== 'undefined') {
  installStyleLearnListeners();
}
