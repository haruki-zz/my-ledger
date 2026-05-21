import {demoSnapshot} from '../src/data/demoData';

test('日本語カテゴリを初期表示できる', () => {
  expect(demoSnapshot.categories.map(category => category.name)).toEqual([
    '家賃',
    '水道光熱費',
    '食材',
    '外食',
    '日用品',
    '交通',
    '医療',
    'その他',
  ]);
});
