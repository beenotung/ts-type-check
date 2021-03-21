# ts-type-check

Check json value based of Typescript type in string

[![npm Package Version](https://img.shields.io/npm/v/ts-type-check.svg?maxAge=2592000)](https://www.npmjs.com/package/ts-type-check)

## Supported Data Type
- string
- number
- boolean
- Date
- object (with required / optional fields)
- Array
- unions
- intersections
- unit types*

*: Unit types are the literal value of primitive types, e.g. `true` | `false` | `'str'` | `1`

## Example
```typescript
import { checkTsType } from 'ts-type-check'

checkTsType('string', 'Alice');
// no error


checkTsType('{ UserId: string }', { UserId: 'Alice' });
// no error
checkTsType('{ UserId: string }', { UserId: 'Alice', Foo: 'bar' }, 'fail');
// throw exception complaining extra field `Foo`
```

More advanced type using nested object, `|`, and `&` are also supported.
```typescript
import { checkTsType } from 'ts-type-check'


checkTsType(`'y' | 'n'`, 'n');
// no error
checkTsType(`1 | 2`, 1);
// no error
checkTsType(`'y' | 'n'`, 'foo');
// throw exception complaining wrong string value
checkTsType(`1 | 2`, 3);
// throw exception complaining wrong number value

checkTsType(`{
    UserId: string,
    Contact: {
      Method: 'telegram'
    } & ({ UserId: string } | { Tel: string }) | {
      Method: 'Email',
      Email: string
    }
  }`,{
    UserId: 'Alice',
    Contact: {
      Method: 'telegram',
      UserId: 'alice',
    },
  });
// no error
checkTsType(`{
    UserId: string,
    Contact: {
      Method: 'telegram'
    } & ({ UserId: string } | { Tel: string }) | {
      Method: 'Email',
      Email: string
    }
  }`,{
    UserId: 'Alice',
    Contact: {
      Method: 'Email',
      Email_: 'alice@domain.com',
    },
  });
// throw exception complaining missing field 'Email' (if the field is given, then will complain extra field 'Email_')
```
