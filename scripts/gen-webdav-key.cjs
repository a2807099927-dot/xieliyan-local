// 生成 WEBDAV_ENC_KEY（32 字节随机 base64）
const fs = require('fs');
const path = require('path');
const key = require('crypto').randomBytes(32).toString('base64');
const out = path.resolve(__dirname, '..', '.webdav-enc-key.txt');
fs.writeFileSync(out, key + '\n', 'utf-8');
console.log('WEBDAV_ENC_KEY 已写入:', out);
console.log('内容:');
console.log(key);
console.log('请复制到 Cloudflare 加密变量后，删除该文件。');

