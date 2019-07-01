export type Type = 'string' | 'number' | 'Date' | 'boolean' | string;

interface TypeChecker {
  type: string;

  check(data: any): void;
}

interface ParseResult<T> {
  res: string;
  data: T;
}

interface Field {
  name: string;
  optional: boolean;
  type: TypeChecker;
}

class ObjectChecker implements TypeChecker {
  constructor(private fields: Field[]) {}

  get type(): string {
    let acc = '{ ';
    acc += this.fields
      .map(({ name, optional, type }) => {
        if (name.split('').some(c => !isWordChar(c))) {
          name = JSON.stringify(name);
        }
        return `${name}${optional ? '?' : ''}: ${type.type}`;
      })
      .join(', ');
    acc += ' }';
    return acc;
  }

  check(data: any): void {
    if (typeof data !== 'object') {
      throw new Error('expect object, got: ' + typeof data);
    }
    for (const field of this.fields) {
      if (!field.optional && !(field.name in data)) {
        throw new Error(`expect field '${field.name}' but missing`);
      }
      if (field.name in data) {
        field.type.check(data[field.name]);
      }
    }
    for (const key of Object.keys(data)) {
      if (!this.fields.find(x => x.name === key)) {
        throw new Error(`got extra field '${key}'`);
      }
    }
  }

  and(that: ObjectChecker): ObjectChecker {
    const fields = new Map<string, Field>();
    this.fields.forEach(field => fields.set(field.name, field));

    that.fields.forEach(field => {
      if (!fields.has(field.name)) {
        fields.set(field.name, field);
        return;
      }
      const thisField = fields.get(field.name);
      const thatField = field;
      const newField: Field = {
        name: thisField.name,
        optional: thisField.optional && thatField.optional,
        // tslint:disable:no-use-before-declare
        type: new AndTypeChecker(thisField.type, thatField.type),
        // tslint:enable:no-use-before-declare
      };
      fields.set(newField.name, newField);
    });
    return new ObjectChecker(Array.from(fields.values()));
  }
}

function isWordChar(c: string): boolean {
  return ('a' <= c && c <= 'z') || ('A' <= c && c <= 'Z') || c === '_';
}

function parseWord(s: string): ParseResult<string> {
  let len = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (isWordChar(c)) {
      len = i + 1;
    } else {
      break;
    }
  }
  if (len === 0) {
    throw new Error(`expect word, but got: '${s[0]}'`);
  }
  return {
    res: s.substr(len),
    data: s.substr(0, len),
  };
}

function expectChar(s: string, c: string) {
  if (s[0] !== c) {
    throw new Error(`expect '${c}', got '${s[0]}'`);
  }
}

function parseObjectType(s: string): ParseResult<ObjectChecker> {
  if (s.length === 0) {
    throw new Error('empty type');
  }
  if (s[0] !== '{') {
    throw new Error(`expect '{' but got '${s[0]}'`);
  }
  s = s.substr(1);
  const fields: Field[] = [];
  for (;;) {
    s = s.trim();
    const c = s[0];

    if (c === '}') {
      s = s.substr(1);
      return {
        res: s,
        data: new ObjectChecker(fields),
      };
    }

    let fieldName: string;
    {
      const res = parseWord(s);
      fieldName = res.data;
      s = res.res.trim();
    }

    let fieldOptional = false;
    if (s[0] === '?') {
      fieldOptional = true;
      s = s.substr(1).trim();
    }

    expectChar(s, ':');
    s = s.substr(1).trim();

    let fieldType: TypeChecker;
    {
      const res = parseType(s);
      fieldType = res.data;
      s = res.res.trim();
    }
    switch (s[0]) {
      case ',':
      case ';':
        s = s.substr(1).trim();
    }

    fields.push({
      name: fieldName,
      optional: fieldOptional,
      type: fieldType,
    });
  }
}

class StringChecker implements TypeChecker {
  constructor(private value: string) {}

  get type(): string {
    return JSON.stringify(this.value);
  }

  check(data: any): void {
    if (typeof data !== 'string') {
      throw new Error('expect string, got: ' + typeof data);
    }
    if (data !== this.value) {
      throw new Error(
        `expect string value: ${JSON.stringify(
          this.value,
        )}, but got: ${JSON.stringify(data)}`,
      );
    }
  }
}

function parseString(s: string): ParseResult<StringChecker> {
  if (s.length === 0) {
    throw new Error('empty type');
  }
  if (s.length < 1) {
    throw new Error('expect string, but only got length of ' + s.length);
  }
  const q = s[0];
  let acc = '';
  for (let i = 1; i < s.length; i++) {
    const c = s[i];
    switch (c) {
      case '\\':
        i++;
        acc += s[i];
        break;
      case q:
        return {
          res: s.substring(i + 1),
          data: new StringChecker(acc),
        };
      default:
        acc += c;
    }
  }
  throw new Error(`expect string, but missing closing quote: ${q}`);
}

function getObjectType(data: any): string {
  return Object.prototype.toString.call(data);
}

class ArrayChecker implements TypeChecker {
  constructor(private elementType: TypeChecker) {}

  get type(): string {
    return `Array<${this.elementType.type}>`;
  }

  check(data: any): void {
    if (!Array.isArray(data)) {
      throw new Error(`expect array, got: ` + getObjectType(data));
    }
    for (const datum of data as any[]) {
      this.elementType.check(datum);
    }
  }
}

function parseArray(s: string): ParseResult<ArrayChecker> {
  const prefixRes = parseWord(s);
  if (prefixRes.data !== 'Array') {
    throw new Error('expect array type, got: ' + JSON.stringify(s));
  }
  s = s.substring('Array'.length).trim();
  expectChar(s, '<');
  s = s.substring(1).trim();

  let type: TypeChecker;
  {
    const res = parseType(s);
    type = res.data;
    s = res.res.trim();
  }

  expectChar(s, '>');
  s = s.substring(1).trim();

  return {
    res: s,
    data: new ArrayChecker(type),
  };
}

function parseOneType(s: string): ParseResult<TypeChecker> {
  s = s.trim();
  if (s.length === 0) {
    throw new Error('empty type');
  }
  if (s.startsWith('{')) {
    return parseObjectType(s);
  }
  for (const typeStr of ['string', 'number', 'Date', 'boolean']) {
    if (s.startsWith(typeStr)) {
      const nextC = s[typeStr.length];
      if (!isWordChar(nextC)) {
        return {
          res: s.substr(typeStr.length),
          data: {
            type: typeStr,
            check(data: any): void {
              checkTsType(typeStr, data);
            },
          },
        };
      }
      console.log({ typeStr, type: s, nextC });
    }
  }
  switch (s[0]) {
    case '"':
    case "'": {
      return parseString(s);
    }
  }
  {
    const prefixRes = parseWord(s);
    if (prefixRes.data === 'Array') {
      return parseArray(s);
    }
  }
}

class OrTypeChecker implements TypeChecker {
  constructor(private left: TypeChecker, private right: TypeChecker) {}

  get type(): string {
    return this.left.type + ' | ' + this.right.type;
  }

  check(data: any): void {
    if (
      this.left instanceof ObjectChecker &&
      this.right instanceof ObjectChecker
    ) {
      // TODO merge object
    }
    const errors = [];
    for (const type of [this.left, this.right]) {
      try {
        type.check(data);
        return;
      } catch (e) {
        errors.push(e);
      }
    }
    throw new Error(
      `failed all type check of OrType, type: ${this.type}, errors:${errors
        .map(e => e.toString())
        .join(' | ')}`,
    );
  }
}

class AndTypeChecker implements TypeChecker {
  constructor(private left: TypeChecker, private right: TypeChecker) {}

  get type(): string {
    return this.left.type + ' & ' + this.right.type;
  }

  check(data: any): void {
    if (
      this.left instanceof ObjectChecker &&
      this.right instanceof ObjectChecker
    ) {
      return this.left.and(this.right).check(data);
    }
    this.left.check(data);
    this.right.check(data);
  }
}

type LogicTerm = TypeChecker | '|' | '&';

/**
 * & has higher binding order than |
 * */
class LogicTypeChecker implements TypeChecker {
  constructor(private terms: LogicTerm[]) {}

  get type(): string {
    return this.terms
      .map(term => (typeof term === 'string' ? term : term.type))
      .join(' ');
  }

  compile(): TypeChecker {
    let xs = this.terms;

    const merge = (xs: LogicTerm[], op: '|' | '&'): LogicTerm[] => {
      const ys: LogicTerm[] = [];
      for (let i = 0; i < xs.length; i++) {
        const curr = xs[i];
        if (curr === op) {
          const left = ys.pop();
          if (!left || typeof left === 'string') {
            throw new Error(
              `missing left-hand-side term for logical op: ` + op,
            );
          }
          const right = xs[i + 1];
          i++;
          if (!right || typeof right === 'string') {
            throw new Error(
              `missing right-hand-side term for logical op: ` + op,
            );
          }
          switch (op) {
            case '&':
              ys.push(new AndTypeChecker(left, right));
              break;
            case '|':
              ys.push(new OrTypeChecker(left, right));
              break;
            default:
              throw new Error(`unknown logical op: ${JSON.stringify(op)}`);
          }
          continue;
        }
        ys.push(curr);
      }
      return ys;
    };

    // merge all &
    xs = merge(xs, '&');

    // merge all |
    xs = merge(xs, '|');

    if (xs.length !== 1) {
      throw new Error(`incomplete logical terms: ${this.type}`);
    }
    const term = xs[0];
    if (typeof term === 'string') {
      throw new Error(`incomplete logical terms: ${this.type}`);
    }
    return term;
  }

  check(data: any): void {
    this.compile().check(data);
  }
}

export function parseType(s: string): ParseResult<TypeChecker> {
  let res = parseOneType(s);
  s = res.res.trim();
  const c = s[0];
  switch (c) {
    case '|':
    case '&':
      break;
    default:
      return res;
  }
  s = res.res.trim();
  const terms: LogicTerm[] = [res.data];
  for (;;) {
    const c = s[0];
    switch (c) {
      case '|':
      case '&':
        terms.push(c);
        s = s.substr(1);
        res = parseOneType(s);
        s = res.res.trim();
        terms.push(res.data);
        break;
      default:
        return {
          res: s,
          data: new LogicTypeChecker(terms).compile(),
        };
    }
  }
}

/**
 * only check for json-compatible types
 * */
export function checkTsType(type: Type, data: any): void {
  const dataType = typeof data;
  switch (type) {
    case 'string':
    case 'number':
    case 'boolean':
      if (dataType !== type) {
        throw new Error(`expect type: ${type}, got type: ${dataType}`);
      }
      return;
    case 'Date':
      if (!(data instanceof Date)) {
        throw new Error(`expect Date, got: ${getObjectType(data)}`);
      }
      return;
    default: {
      const res = parseType(type);
      if (res.res !== '') {
        console.error('unknown type:', type);
        throw new Error(
          `failed to parse type, reminding type string: '${res.res}'`,
        );
      }
      // console.log('parsed type:', res.data.type);
      // let util = require('util');
      // console.log('checker:', util.inspect(res.data, { depth: 99 }));
      res.data.check(data);
    }
  }
}
