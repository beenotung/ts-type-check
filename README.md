# ts-type-check

Check json value based of Typescript type in string, throw express-compatible error with 400 statusCode.

[![npm Package Version](https://img.shields.io/npm/v/ts-type-check.svg?maxAge=2592000)](https://www.npmjs.com/package/ts-type-check)

## Supported Data Type

- string
- number
- boolean
- Date
- null
- object (with required / optional fields)
- Array
- unions
- intersections
- unit types\*

\*: Unit types are the literal value of primitive types, e.g. `true` | `false` | `'str'` | `1`

## Typescript signatures

`checkTsType()` can be used for one-off type checking.

```typescript
/**
 * only check for json-compatible types
 *
 * @throws TypeCheckError if failed
 * */
function checkTsType(type: string, data: any, options?: TypeCheckOptions): void

type TypeCheckOptions = {
  casualBoolean?: boolean
}

class TypeCheckError extends TypeError {
  statusCode = 400
  status = 400
  message: string
}
```

`parseTsType()` compiles the type string into a TypeChecker.

It is optimized for repeating type checking.

(It is used by `checkTsType()` internally.)

```typescript
function parseTsType(type: Type): TypeChecker

interface TypeChecker {
  type: string
  check(data: any, options?: TypeCheckOptions): void
}
```

## Example

```typescript
import { checkTsType } from 'ts-type-check'

checkTsType('string', 'Alice')
// no error

checkTsType('{ UserId: string }', { UserId: 'Alice' })
// no error
checkTsType('{ UserId: string }', { UserId: 'Alice', Foo: 'bar' }, 'fail')
// throw exception complaining extra field `Foo`
```

More advanced type using nested object, `|`, and `&` are also supported.

```typescript
import { checkTsType } from 'ts-type-check'

checkTsType(`'y' | 'n'`, 'n')
// no error
checkTsType(`1 | 2`, 1)
// no error
checkTsType(`'y' | 'n'`, 'foo')
// throw exception complaining wrong string value
checkTsType(`1 | 2`, 3)
// throw exception complaining wrong number value

checkTsType(
  `{
    UserId: string,
    Contact: {
      Method: 'telegram'
    } & ({ UserId: string } | { Tel: string }) | {
      Method: 'Email',
      Email: string
    }
  }`,
  {
    UserId: 'Alice',
    Contact: {
      Method: 'telegram',
      UserId: 'alice',
    },
  },
)
// no error
checkTsType(
  `{
    UserId: string,
    Contact: {
      Method: 'telegram'
    } & ({ UserId: string } | { Tel: string }) | {
      Method: 'Email',
      Email: string
    }
  }`,
  {
    UserId: 'Alice',
    Contact: {
      Method: 'Email',
      Email_: 'alice@domain.com',
    },
  },
)
// throw exception complaining missing field 'Email' (if the field is given, then will complain extra field 'Email_')
```

## License

This project is licensed with [BSD-2-Clause](./LICENSE)

This is free, libre, and open-source software. It comes down to four essential freedoms [[ref]](https://seirdy.one/2021/01/27/whatsapp-and-the-domestication-of-users.html#fnref:2):

- The freedom to run the program as you wish, for any purpose
- The freedom to study how the program works, and change it so it does your computing as you wish
- The freedom to redistribute copies so you can help others
- The freedom to distribute copies of your modified versions to others
