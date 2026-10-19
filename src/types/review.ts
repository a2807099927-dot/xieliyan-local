// 模块说明：全文智能润色的数据类型定义。

export type ReviewStatus =
 | 'idle'
 | 'scanning'
 | 'done'
 | 'error';

export interface ParagraphDiff {
 id: string;
 original: string;
 rewritten: string;
 status: 'pending' | 'accepted' | 'rejected';
}

export interface ReviewResult {
 chapterId: string;
 createdAt: number;
 rewrittenFullText: string;
 originalFullText: string;
 paragraphDiffs?: ParagraphDiff[];
}

export type ReviewAnnotation = any;
export const ISSUE_TYPE_COLOR: Record<string, string> = {
 wording: 'var(--accent)',
 order: 'var(--accent)',
 description: 'var(--accent)'
};
