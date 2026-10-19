// 模块说明：差异分析流 Hook。
// 关键职责：在 AI 改写后做段落级 diff 与高亮。
import { useCallback } from 'react';
import { electronAPI } from '../utils/electron';
import { getPromptSync, withBaseProse } from '../utils/promptStore';

interface UseDiffAnalysisFlowParams {
 bookId: string;
 chapterId: string;
 island: {
 startTask: (payload: any) => string;
 finishTask: (id: string) => void;
 show: (payload: any) => void;
 };
 setAiDiffAnalysis: (value: { original: string; result: string; analysis: string } | null) => void;
}

/**
 * Handles diff-analysis request lifecycle after accepting inline AI result.
 * Keeps request, success/failure feedback, and state update in one place.
 */
export function useDiffAnalysisFlow({
 bookId,
 chapterId,
 island,
 setAiDiffAnalysis
}: UseDiffAnalysisFlowParams): {
 requestDiffAnalysis: (original: string, result: string) => Promise<void>;
} {
 const requestDiffAnalysis = useCallback(
 async (original: string, result: string) => {
 const taskId = island.startTask({ type: 'progress', status: 'thinking', message: 'AI 正在分析调整差异...' });
 try {
 const response = await electronAPI.ai.chat({
 stream: false,
 bookId,
 chapterId,
 disableStyle: true,
 disableRag: true,
 messages: [
 {
 role: 'system',
 content:
 withBaseProse(getPromptSync('diff_analysis_system', '你是中文写作分析助手。用户采纳了 AI 润色建议，请简要分析前后差异（3-5 条），每条说明“改了什么 -> 为什么更好”，每条以“• ”开头。'))
 },
 {
 role: 'user',
 content: `【原文】\n${original}\n\n【润色后】\n${result}`
 }
 ]
 });
 const analysis = (response?.text || '').trim();
 island.finishTask(taskId);
 if (analysis) {
 setAiDiffAnalysis({ original, result, analysis });
 } else {
 island.show({ type: 'warning', message: 'AI 未返回分析内容。', autoHideMs: 1500 });
 }
 } catch {
 island.finishTask(taskId);
 island.show({ type: 'error', message: '分析请求失败。', autoHideMs: 1500 });
 }
 },
 [bookId, chapterId, island, setAiDiffAnalysis]
 );

 return { requestDiffAnalysis };
}

