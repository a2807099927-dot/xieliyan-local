type MiniSearchDoc = object;

interface MiniSearchOptions<T extends MiniSearchDoc> {
 idField?: Extract<keyof T, string>;
 fields?: Array<Extract<keyof T, string>>;
 storeFields?: Array<Extract<keyof T, string>>;
 searchOptions?: {
 prefix?: boolean;
 fuzzy?: number;
 boost?: Record<string, number>;
 };
}

export type MiniSearchResult<T extends MiniSearchDoc> = Partial<T> & {
 id: string;
 score: number;
};

function tokenize(value: string): string[] {
 return String(value || '')
 .toLowerCase()
 .split(/[\s,，。；;！？!?\n\r]+/)
 .map((item) => item.trim())
 .filter((item) => item.length >= 2);
}

function fieldToText(value: unknown): string {
 if (Array.isArray(value)) return value.map((item) => String(item || '')).join(' ');
 if (value && typeof value === 'object') return JSON.stringify(value);
 return String(value || '');
}

export default class MiniSearch<T extends MiniSearchDoc> {
 private readonly idField: Extract<keyof T, string>;
 private readonly fields: Array<Extract<keyof T, string>>;
 private readonly storeFields: Array<Extract<keyof T, string>>;
 private readonly boost: Record<string, number>;
 private readonly prefix: boolean;
 private docs: T[] = [];

 constructor(options: MiniSearchOptions<T> = {}) {
 this.idField = (options.idField || 'id') as Extract<keyof T, string>;
 this.fields = (options.fields || []) as Array<Extract<keyof T, string>>;
 this.storeFields = (options.storeFields || []) as Array<Extract<keyof T, string>>;
 this.boost = options.searchOptions?.boost || {};
 this.prefix = Boolean(options.searchOptions?.prefix);
 }

 addAll(docs: T[]): void {
 this.docs.push(...docs);
 }

 search(query: string): Array<MiniSearchResult<T>> {
 const terms = tokenize(query);
 if (!terms.length) return [];

 const results: Array<MiniSearchResult<T>> = [];

 for (const doc of this.docs) {
 let score = 0;

 for (const field of this.fields) {
 const haystack = fieldToText((doc as Record<string, unknown>)[field]).toLowerCase();
 if (!haystack) continue;
 const fieldBoost = this.boost[field] || 1;

 for (const term of terms) {
 if (haystack.includes(term)) {
 score += fieldBoost * (term.length >= 4 ? 3 : 1.5);
 continue;
 }
 if (this.prefix) {
 const words = haystack.split(/\s+/);
 if (words.some((word) => word.startsWith(term))) {
 score += fieldBoost;
 }
 }
 }
 }

 if (score <= 0) continue;

 const stored = this.storeFields.length
 ? Object.fromEntries(this.storeFields.map((field) => [field, (doc as Record<string, unknown>)[field]]))
 : doc;

 results.push({
 ...(stored as Partial<T>),
 id: String((doc as Record<string, unknown>)[this.idField]),
 score
 });
 }

 return results.sort((left, right) => right.score - left.score);
 }
}
