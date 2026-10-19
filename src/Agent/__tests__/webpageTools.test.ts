import { describe, expect, it } from 'vitest';
import {
  buildExtractScript,
  isReadableChapterText,
  isLikelyEncryptedGarbled,
} from '../tools/webpageTools';

describe('webpageTools 反爬边界判断', () => {
  it('正常正文通过', () => {
    const text = '第一章 觉醒\n林尘睁开眼，发现自己躺在一片陌生的山崖上。'.repeat(10);
    expect(isReadableChapterText(text)).toBe(true);
  });

  it('正文过短视为失败', () => {
    expect(isReadableChapterText('太短了')).toBe(false);
  });

  it('私用区字符占比高 → 字体加密乱码（番茄类）', () => {
    expect(isLikelyEncryptedGarbled('\ue063皇朝\ue064皇朝\ue065皇朝\ue066皇朝\ue067皇朝\ue068皇朝\ue069皇朝\ue06a皇朝\ue06b皇朝\ue06c皇朝\ue06d皇朝\ue06e皇朝\ue06f皇朝\ue070皇朝\ue071皇朝\ue072皇朝\ue073皇朝\ue074皇朝\ue075皇朝\ue076皇朝')).toBe(true);
  });

  it('验证码页被识别为不可读', () => {
    expect(isReadableChapterText('请拖动滑块完成验证\n安全检测中，请稍候'.repeat(10))).toBe(false);
  });

  it('正常中文没有误报乱码', () => {
    expect(isLikelyEncryptedGarbled('正常的中文小说正文，主角修炼突破，一路打脸。'.repeat(5))).toBe(false);
  });
});

describe('webpageTools 提取脚本', () => {
  it('buildExtractScript 包含默认容器选择器与截断', () => {
    const script = buildExtractScript(undefined, 3000);
    expect(script).toContain('#chaptercontent');
    expect(script).toContain('3000');
    expect(script).toContain('innerText');
  });

  it('自定义选择器生效', () => {
    const script = buildExtractScript('#custom-content', 1000);
    expect(script).toContain('#custom-content');
    expect(script).not.toContain('#chaptercontent');
  });
});
