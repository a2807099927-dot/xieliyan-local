// types 
export interface Chapter {
 index: number;
 title: string;
 url: string;
 status: 'pending' | 'crawling' | 'done' | 'error';
 content?: string;
 filePath?: string;
}

export interface CrawlSession {
 bookName: string;
 savePath: string;
 chapters: Chapter[];
 currentIndex: number;
 isRunning: boolean;
 totalCount: number;
 doneCount: number;
}

export type AnalysisMode = 'full' | 'plot' | 'character' | 'technique' | 'value';

export interface ChatMessage {
 role: 'user' | 'assistant';
 content: string;
 isStreaming?: boolean;
}

export interface AnalysisState {
 currentChapter: Chapter | null;
 messages: ChatMessage[];
 isAnalyzing: boolean;
 activeMode: AnalysisMode;
}
