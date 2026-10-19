// novel-lab-env.d 
import type * as React from 'react';
import type { AnalysisMode } from './types';

declare global {
 namespace JSX {
 interface IntrinsicElements {
 webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
 }
 }

 interface Window {
 novelLab?: {
 getAppConfig: () => Promise<{
 config?: {
 ui?: {
 theme?: string;
 appBrightness?: number;
 appContrast?: number;
 appSaturation?: number;
 customTheme?: {
 ambientGlow?: string;
 primaryColor?: string;
 secondaryColor?: string;
 gradientFrom?: string;
 gradientTo?: string;
 backgroundImage?: string;
 surfaceAlpha?: number;
 fontFamily?: string;
 textColor?: string;
 };
 };
 };
 }>;
 selectSavePath: () => Promise<string | null>;
 saveChapter: (args: {
 savePath: string;
 bookName: string;
 chapter: { index: number; title: string; content: string; url: string; scrapedAt: string };
 }) => Promise<{ success: boolean; filePath?: string; error?: string }>;
 saveBookIndex: (args: {
 savePath: string;
 bookName: string;
 chapters: Array<{ index: number; title: string; url: string }>;
 }) => Promise<{ success: boolean; error?: string }>;
 analyze: (request: {
 requestId?: string;
 chapterTitle: string;
 chapterContent: string;
 mode: AnalysisMode;
 userQuestion?: string;
 conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
 }) => void;
 abortAnalyze: () => void;
 onAnalyzeChunk: (cb: (payload: string | { requestId?: string; text?: string }) => void) => () => void;
 onAnalyzeDone: (cb: (payload?: { requestId?: string }) => void) => () => void;
 onAnalyzeError: (cb: (payload: string | { requestId?: string; error?: string }) => void) => () => void;

 // Archive management
 listArchives: (args: unknown) => Promise<unknown>;
 loadBook: (args: unknown) => Promise<unknown>;
 deleteBook: (args: { folderPath: string }) => Promise<{ success: boolean; error?: string }>;
 importTxt: () => Promise<{ success: boolean; bookName?: string; chapters?: Array<{ index: number; title: string; content: string }>; error?: string }>;
 saveAnalysis: (args: unknown) => Promise<unknown>;
 listAnalyses: (args: unknown) => Promise<unknown>;
 loadAnalysis: (args: unknown) => Promise<unknown>;
 setNovelLabPaths: (args: { savePath?: string; lastBookPath?: string }) => Promise<{ success: boolean; error?: string }>;
 };
 }
}

export {};
