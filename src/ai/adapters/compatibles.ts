// compatibles.ts - Registry for OpenAI-compatible provider adapters.
import type { AiProviderConfig } from '../../types/ai';
import { OpenAICompatibleAdapter } from './openai';

// ── 纯浏览器实现：不依赖 node:crypto / Buffer ──────────────────────────────
// HMAC-SHA256 via pure JS（用于智谱 JWT 签名）
function hmacSha256Sync(key: string, message: string): string {
 // 将字符串转为字节数组
 const enc = (s: string): number[] => Array.from(s).map((c) => c.charCodeAt(0) & 0xff);
 const blockSize = 64;
 let keyBytes = enc(key);
 if (keyBytes.length > blockSize) keyBytes = sha256Bytes(keyBytes);
 while (keyBytes.length < blockSize) keyBytes.push(0);
 const ipad = keyBytes.map((b) => b ^ 0x36);
 const opad = keyBytes.map((b) => b ^ 0x5c);
 const inner = sha256Bytes([...ipad, ...enc(message)]);
 const outer = sha256Bytes([...opad, ...inner]);
 return btoa(String.fromCharCode(...outer))
 .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// SHA-256 纯 JS 实现（无外部依赖）
function sha256Bytes(data: number[]): number[] {
 const K = [
 0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
 0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
 0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
 0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
 0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
 0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
 0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
 0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
 ];
 let [h0,h1,h2,h3,h4,h5,h6,h7] = [
 0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19
 ];
 const ml = data.length;
 data.push(0x80);
 while (data.length % 64 !== 56) data.push(0);
 const bits = ml * 8;
 for (let i = 7; i >= 0; i--) { data.push((bits / Math.pow(256, i)) & 0xff); }
 const ro = (n: number, b: number) => ((n >>> b) | (n << (32 - b))) >>> 0;
 for (let chunk = 0; chunk < data.length; chunk += 64) {
 const w: number[] = [];
 for (let i = 0; i < 16; i++) w.push((data[chunk+i*4]<<24)|(data[chunk+i*4+1]<<16)|(data[chunk+i*4+2]<<8)|data[chunk+i*4+3]);
 for (let i = 16; i < 64; i++) {
 const s0 = ro(w[i-15],7)^ro(w[i-15],18)^(w[i-15]>>>3);
 const s1 = ro(w[i-2],17)^ro(w[i-2],19)^(w[i-2]>>>10);
 w.push(((w[i-16]+s0+w[i-7]+s1)>>>0));
 }
 let [a,b,c,d,e,f,g,h] = [h0,h1,h2,h3,h4,h5,h6,h7];
 for (let i = 0; i < 64; i++) {
 const S1 = ro(e,6)^ro(e,11)^ro(e,25);
 const ch = (e&f)^(~e&g);
 const temp1 = (h+S1+ch+K[i]+w[i])>>>0;
 const S0 = ro(a,2)^ro(a,13)^ro(a,22);
 const maj = (a&b)^(a&c)^(b&c);
 const temp2 = (S0+maj)>>>0;
 [h,g,f,e,d,c,b,a] = [g,f,e,(d+temp1)>>>0,c,b,a,(temp1+temp2)>>>0];
 }
 [h0,h1,h2,h3,h4,h5,h6,h7] = [(h0+a)>>>0,(h1+b)>>>0,(h2+c)>>>0,(h3+d)>>>0,(h4+e)>>>0,(h5+f)>>>0,(h6+g)>>>0,(h7+h)>>>0];
 }
 const out: number[] = [];
 for (const v of [h0,h1,h2,h3,h4,h5,h6,h7]) {
 out.push((v>>>24)&0xff,(v>>>16)&0xff,(v>>>8)&0xff,v&0xff);
 }
 return out;
}

function toBase64Url(input: string): string {
 return btoa(input).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}

function zhipuToken(apiKey: string): string {
 const [id, secret] = apiKey.split('.');
 if (!id || !secret) return apiKey;
 const header = { alg: 'HS256', sign_type: 'SIGN' };
 const now = Math.floor(Date.now() / 1000);
 const payload = { api_key: id, exp: now + 3600, timestamp: now };
 const encodedHeader = toBase64Url(JSON.stringify(header));
 const encodedPayload = toBase64Url(JSON.stringify(payload));
 const toSign = `${encodedHeader}.${encodedPayload}`;
 const signature = hmacSha256Sync(secret, toSign);
 return `${toSign}.${signature}`;
}

class ZhipuAdapter extends OpenAICompatibleAdapter {
 protected override getAuthHeader(config: AiProviderConfig): string {
 return zhipuToken(config.apiKey);
 }
}


export const openaiAdapter = new OpenAICompatibleAdapter({
 provider: 'openai',
 name: 'OpenAI / ChatGPT',
 isLocked: true,
 lockedBaseUrl: 'https://api.openai.com',
 lockedApiPath: '/v1/chat/completions',
 supportedModels: ['gpt-4.1', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
 defaultModel: 'gpt-4o'
});

export const deepseekAdapter = new OpenAICompatibleAdapter({
 provider: 'deepseek',
 name: 'DeepSeek',
 isLocked: true,
 lockedBaseUrl: 'https://api.deepseek.com',
 lockedApiPath: '/v1/chat/completions',
 supportedModels: ['deepseek-chat', 'deepseek-reasoner'],
 defaultModel: 'deepseek-chat'
});

export const grokAdapter = new OpenAICompatibleAdapter({
 provider: 'grok',
 name: 'xAI / Grok',
 isLocked: true,
 lockedBaseUrl: 'https://api.x.ai',
 lockedApiPath: '/v1/chat/completions',
 supportedModels: ['grok-beta', 'grok-2'],
 defaultModel: 'grok-beta'
});

export const zhipuAdapter = new ZhipuAdapter({
 provider: 'zhipu',
 name: '智谱 AI / GLM',
 isLocked: true,
 lockedBaseUrl: 'https://open.bigmodel.cn',
 lockedApiPath: '/api/paas/v4/chat/completions',
 supportedModels: ['glm-4', 'glm-4-flash', 'glm-4-air'],
 defaultModel: 'glm-4-flash'
});

export const sensenovaAdapter = new OpenAICompatibleAdapter({
 provider: 'sensenova',
 name: 'SenseNova',
 isLocked: true,
 lockedBaseUrl: 'https://token.sensenova.cn',
 lockedApiPath: '/v1/chat/completions',
 supportedModels: ['sensenova-6.7-flash-lite'],
 defaultModel: 'sensenova-6.7-flash-lite'
});

export const proxyAdapter = new OpenAICompatibleAdapter({
 provider: 'proxy',
 name: '中转 API / 第三方代理',
 isLocked: false,
 supportedModels: [],
 defaultModel: 'gpt-4o'
});

export const vertexOpenAIAdapter = new OpenAICompatibleAdapter({
 provider: 'vertex_ai',
 name: 'Google Vertex AI (API Key)',
 isLocked: true,
 lockedBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
 lockedApiPath: '/chat/completions',
 supportedModels: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash-001'],
 defaultModel: 'gemini-2.5-flash'
});

export const localAdapter = new OpenAICompatibleAdapter({
 provider: 'local',
 name: '本地模型 (Ollama / LM Studio)',
 isLocked: false,
 supportedModels: [],
 defaultModel: 'llama3'
});
