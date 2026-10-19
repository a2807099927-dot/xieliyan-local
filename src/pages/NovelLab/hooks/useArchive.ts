// useArchive 
import { useCallback, useMemo, useState } from 'react';
import type { AnalysisMode, ChatMessage } from '../types';

export interface ArchivedBook {
 bookName: string;
 folderPath: string;
 lastExtractedIndex: number;
 lastAnalyzedIndex: number;
 lastAnalyzedMode: string;
 totalChapters: number;
 lastUpdatedAt: string;
}

export interface AnalysisSessionMeta {
 id: string;
 mode: string;
 label: string;
 chapterFrom: number;
 chapterTo: number;
 createdAt: string;
}

export function useArchive() {
 const [archivedBooks, setArchivedBooks] = useState<ArchivedBook[]>([]);
 const [analysisSessions, setAnalysisSessions] = useState<AnalysisSessionMeta[]>([]);
 const [isLoading, setIsLoading] = useState(false);

 const refreshArchives = useCallback(async (savePath: string) => {
 if (!savePath) return;
 const res = (await window.novelLab?.listArchives({ savePath })) as { success: boolean; books?: ArchivedBook[] };
 if (res?.success && res.books) setArchivedBooks(res.books);
 }, []);

 const loadBook = useCallback(async (folderPath: string) => {
 // Load book metadata and normalize missing fields for downstream panels.
 setIsLoading(true);
 try {
 const res = (await window.novelLab?.loadBook({ folderPath })) as {
 success: boolean;
 meta?: { bookName: string; savePath: string; sourceUrl?: string; lastExtractedIndex: number; lastAnalyzedIndex: number; lastAnalyzedMode: string };
 chapters?: Array<{ index: number; title: string; url: string; content: string; scrapedAt: string }>;
 };
 return res?.success ? res : null;
 } finally {
 setIsLoading(false);
 }
 }, []);

 const refreshAnalysisSessions = useCallback(async (savePath: string, bookName: string) => {
 if (!savePath || !bookName) return;
 const res = (await window.novelLab?.listAnalyses({ savePath, bookName })) as { success: boolean; sessions?: AnalysisSessionMeta[] };
 if (res?.success && res.sessions) setAnalysisSessions(res.sessions);
 }, []);

 const loadAnalysis = useCallback(async (savePath: string, bookName: string, id: string): Promise<ChatMessage[] | null> => {
 const res = (await window.novelLab?.loadAnalysis({ savePath, bookName, id })) as {
 success: boolean;
 session?: { messages: Array<{ role: 'user' | 'assistant'; content: string }> };
 };
 if (!res?.success || !res.session) return null;
 return res.session.messages.map((m) => ({ role: m.role, content: m.content }));
 }, []);

 const saveAnalysis = useCallback(async (
 // Persist a completed analysis conversation as one immutable session record.
 savePath: string,
 bookName: string,
 mode: AnalysisMode,
 chapterFrom: number,
 chapterTo: number,
 messages: ChatMessage[]
 ) => {
 if (!savePath || !bookName) return;
 const cleanMessages = messages.filter((m) => !m.isStreaming && m.content.trim()).map((m) => ({ role: m.role, content: m.content }));
 if (cleanMessages.length === 0) return;

 const label = chapterFrom === chapterTo ? `第${chapterFrom}章 · ${mode}` : `第${chapterFrom}-${chapterTo}章 · ${mode}`;

 await window.novelLab?.saveAnalysis({
 savePath,
 bookName,
 session: {
 mode,
 label,
 chapterFrom,
 chapterTo,
 createdAt: new Date().toISOString(),
 messages: cleanMessages
 }
 });
 }, []);

 return useMemo(() => ({
 archivedBooks,
 analysisSessions,
 isLoading,
 refreshArchives,
 loadBook,
 refreshAnalysisSessions,
 loadAnalysis,
 saveAnalysis
 }), [
 archivedBooks,
 analysisSessions,
 isLoading,
 refreshArchives,
 loadBook,
 refreshAnalysisSessions,
 loadAnalysis,
 saveAnalysis
 ]);
}
