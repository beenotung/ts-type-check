import { checkTsType, parseTsType, Type, TypeCheckOptions } from '../src';

function test(
  type: Type,
  data: any,
  expectResult: 'pass' | 'fail' = 'pass',
  options?: TypeCheckOptions,
) {
  let error;
  try {
    checkTsType(type, data, options);
    parseTsType(type).check(data, options);
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
        throw new Error('missed exception');
      }
    }
  }
  // console.log('pass');
}

test('string', 'Alice');
test('string', 123, 'fail');

test('number', 123);
test('number', '123', 'fail');

test('boolean', true);
test('boolean', false);
test('boolean', 'true', 'fail');
test('boolean', 'false', 'fail');

test('true', true);
test('false', false);
test('true', false, 'fail');
test('false', true, 'fail');

test('true', 1, 'fail');
test('true', 1, 'fail', { casualBoolean: false });
test('true', 1, 'pass', { casualBoolean: true });

test('false', 0, 'fail');
test('false', 0, 'fail', { casualBoolean: false });
test('false', 0, 'pass', { casualBoolean: true });

test('Date', new Date());
test('Date', new Date().getTime(), 'fail');

test('null', null);
test('null', 0, 'fail');
test('null', '', 'fail');
test('null', {}, 'fail');

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
test(`1 | 2`, 1);
test(`1 | 2`, 3, 'fail');

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

test(`number`, 1);
test(`(number)`, 1);
test(`{ a: number } | ({ b: number } & { c: number })`, { a: 1 });
test(`{ a: number } | ({ b: number } & { c: number })`, { b: 1, c: 1 });
test(
  `{ a: number } | ({ b: number } & { c: number })`,
  { a: 1, b: 1, c: 1 },
  'fail',
);
test(`{ a: number } | ({ b: number } & { c: number })`, { a: 1, b: 1 }, 'fail');
test(`{ a: number } | ({ b: number } & { c: number })`, { a: 1, c: 1 }, 'fail');
test(`({ a: number } | { b: number }) & { c: number }`, { a: 1, c: 1 });
test(`({ a: number } | { b: number }) & { c: number }`, { b: 1, c: 1 });
test(
  `({ a: number } | { b: number }) & { c: number }`,
  { a: 1, b: 1, c: 1 },
  'fail',
);
test(`({ a: number } | { b: number }) & { c: number }`, { a: 1 }, 'fail');
test(`({ a: number } | { b: number }) & { c: number }`, { b: 1 }, 'fail');
test(`({ a: number } | { b: number }) & { c: number }`, { c: 1 }, 'fail');

{
  let x: {
    UserId: string;
    Contact:
      | ({
          Method: 'telegram';
        } & ({ UserId: string } | { Tel: string }))
      | {
          Method: 'Email';
          Email: string;
        };
  };
  let type = `{
    UserId: string,
    Contact: {
      Method: 'telegram'
    } & ({ UserId: string } | { Tel: string }) | {
      Method: 'Email',
      Email: string
    }
  }`;
  x = {
    UserId: 'Alice',
    Contact: {
      Method: 'telegram',
      UserId: 'alice',
    },
  };
  test(type, x);
  x = {
    UserId: 'Alice',
    Contact: {
      Method: 'telegram',
      Tel: '123',
    },
  };
  test(type, x);
  x = {
    UserId: 'Alice',
    Contact: {
      Method: 'Email',
      Email: 'alice@domain.com',
    },
  };
  test(type, x);
  x = {
    UserId: 'Alice',
    Contact: null as any,
  };
  test(type, x, 'fail');
  x = {
    UserId: 'Alice',
    Contact: undefined as any,
  };
  test(type, x, 'fail');
  x = {
    UserId: 'Alice',
    Contact: {
      Method: 'Email',
      Email_: 'alice@domain.com',
    } as any,
  };
  test(type, x, 'fail');
}

{
  let x: { Success: true } | { Success: false; Reason: string } = {
    Success: true,
  };
  let type = `{ Success: true } | { Success: false, Reason: string }`;
  test(type, x, 'pass');
}

// check if it can parse object key with spaces
parseTsType(`{
  labels: Array<string>
  data: {
    "Numbers of Bookings": Array<number>
  }
}`);

console.log('all passed.');
