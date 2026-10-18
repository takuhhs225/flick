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

test.describe('extractText: 本文が空になる返却', () => {
  test('content が null(推論だけで上限に達した等)のときは空文字になり、例外にならない', () => {
    expect(extractText({ choices: [{ message: { content: null, reasoning_content: '考え中…' }, finish_reason: 'length' }] })).toBe('');
    expect(extractText({ choices: [] })).toBe('');
    expect(extractText(null)).toBe('');
  });
});

test.describe('行頭の数字は本文として残す', () => {
  test('parseTitle: 「22時に寝る」の 22 を消さない。箇条書きの番号・記号だけ取る', () => {
    expect(parseTitle('22時に寝る')).toBe('22時に寝る');
    expect(parseTitle('3月までに確定申告を終える')).toBe('3月までに確定申告を終える');
    expect(parseTitle('1. 牛乳を買う')).toBe('牛乳を買う');
    expect(parseTitle('2) 牛乳を買う')).toBe('牛乳を買う');
    expect(parseTitle('- 牛乳を買う')).toBe('牛乳を買う');
    expect(parseTitle('・牛乳を買う')).toBe('牛乳を買う');
  });
  test('parseSteps: 数字で始まるサブタスクも消さない', () => {
    expect(parseSteps('1. 22時にスマホを置く\n2. 23時までに電気を消す\n3. 7時に起きる')).toEqual([
      '22時にスマホを置く',
      '23時までに電気を消す',
      '7時に起きる',
    ]);
    expect(parseSteps('["22時にスマホを置く","7時に起きる"]')).toEqual(['22時にスマホを置く', '7時に起きる']);
  });
});
