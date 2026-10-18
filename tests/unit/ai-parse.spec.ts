import { test, expect } from '@playwright/test';
import { extractText, parseSteps, parseTitle } from '../../worker/ai';

// Workers AI のモデルによって応答形式・出力のクセが違うため、パーサーは広めに受け止める。
test.describe('AI 応答のパーサー', () => {
  test('extractText: 旧形式 {response} / OpenAI 互換 choices / 文字列', () => {
    expect(extractText({ response: 'こんにちは' })).toBe('こんにちは');
    expect(extractText({ choices: [{ message: { content: 'OpenAI形式' } }] })).toBe('OpenAI形式');
    expect(extractText({ choices: [{ message: { content: [{ text: 'a' }, { text: 'b' }] } }] })).toBe('ab');
    expect(extractText({ choices: [{ text: '補完形式' }] })).toBe('補完形式');
    expect(extractText('plain')).toBe('plain');
    expect(extractText(null)).toBe('');
    expect(extractText({})).toBe('');
  });

  test('parseTitle: 引用符・接頭辞・コードフェンス・複数行を取り除いて 1 行にする', () => {
    expect(parseTitle('牛乳を買う')).toBe('牛乳を買う');
    expect(parseTitle('「牛乳を買う」')).toBe('牛乳を買う');
    expect(parseTitle('タスク名: 牛乳を買う')).toBe('牛乳を買う');
    expect(parseTitle('```\n牛乳を買う\n```')).toBe('牛乳を買う');
    expect(parseTitle('\n\n- 牛乳を買う\nおまけの説明')).toBe('牛乳を買う');
    expect(parseTitle('   ')).toBeNull();
    expect(parseTitle('あ'.repeat(300))).toHaveLength(120);
  });

  test('parseSteps: JSON 配列 / 前後に文章が付く / 箇条書きにフォールバック / 重複と過多を整理', () => {
    expect(parseSteps('["調べる","買う","届ける"]')).toEqual(['調べる', '買う', '届ける']);
    expect(parseSteps('はい、分解しました:\n```json\n["調べる","買う"]\n```')).toEqual(['調べる', '買う']);
    expect(parseSteps('1. 調べる\n2. 買う\n3. 届ける')).toEqual(['調べる', '買う', '届ける']);
    expect(parseSteps('- 調べる\n- 調べる\n- 買う')).toEqual(['調べる', '買う']);
    expect(parseSteps('["a","b","c","d","e","f","g","h"]')).toHaveLength(6);
    expect(parseSteps('["a", 1, null, "b"]')).toEqual(['a', 'b']);
    expect(parseSteps('壊れた [JSON')).toEqual(['壊れた [JSON']);
    expect(parseSteps('')).toEqual([]);
  });
});
