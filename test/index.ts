import { checkTsType, Type } from '../src';

function test(type: Type, data: any, expectResult: 'pass' | 'fail' = 'pass') {
  let error;
  try {
    checkTsType(type, data);
  } catch (e) {
    error = e;
  } finally {
    if (expectResult === 'pass') {
      if (error) {
        throw error;
      }
    }
    if (expectResult === 'fail') {
      if (!error) {
        console.log('expect to fail, but passed.', { type, data });
      }
    }
  }
}

test('string', 'Alice');
test('string', 123, 'fail');

test('number', 123);
test('number', '123', 'fail');

test('Date', new Date());
test('Date', new Date().getTime(), 'fail');

test('{ UserId: string }', { UserId: 'Alice' });
test('{ UserId: string }', { UserId: 'Alice', Foo: 'bar' }, 'fail');
test('{ UserId: string }', {}, 'fail');

test('{ UserId?: string }', {});
test('{ UserId?: string }', { UserId: 'Alice' });
test('{ UserId?: string }', { UserId: 'Alice', Foo: 'bar' }, 'fail');
test('{ UserId?: string }', { UserId: 123 }, 'fail');

test(`'y'`, 'y');
test(`'y'`, 'n', 'fail');

test(`Array<string>`, []);
test(`Array<string>`, ['foo']);
test(`Array<string>`, ['foo', 'bar']);
test(`Array<string>`, ['foo', 1], 'fail');
test(`Array<string>`, [1], 'fail');

test(`'y' | 'n'`, 'y');
test(`'y' | 'n'`, 'n');
test(`'y' | 'n'`, 'foo', 'fail');

test(`{ UserId: string } & { Age: number }`, { UserId: 'Alice', Age: 123 });
test(
  `{ UserId: string } & { Age: number }`,
  { UserId: 'Alice', Age: 123, Foo: 'bar' },
  'fail',
);

/*
 * check binding order of | and &
 * Example: let x: { a: number } | { b: number } & { c: number };
 * if b exist, c also exist
 * but if a exist, neither b nor c exist
 * */
test(`{ a: number } | { b: number } & { c: number }`, { a: 1 });
test(`{ b: number } & { c: number } | { a: number }`, { a: 1 });
test(`{ a: number } | { b: number } & { c: number }`, { b: 1, c: 1 });
test(`{ b: number } & { c: number } | { a: number }`, { b: 1, c: 1 });
test(`{ a: number } | { b: number } & { c: number }`, { b: 1 }, 'fail');
test(`{ a: number } | { b: number } & { c: number }`, { a: 1, b: 1 }, 'fail');
test(
  `{ a: number } | { b: number } & { c: number }`,
  { a: 1, b: 1, c: 1 },
  'fail',
);

// TODO bracket

console.log('all passed.');
