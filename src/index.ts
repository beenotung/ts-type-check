// import * as util from 'util';

const dev = (...args: any[]) => {
  return;
  console.log('[dev]', ...args);
};
const devStr = (name: string, str: string) => {
  return;
  dev(name);
  dev('='.repeat(16));
  console.log(str);
  dev('='.repeat(16));
};

export type Type =
  | 'string'
  | 'number'
  | 'Date'
  | 'boolean'
  | 'true'
  | 'false'
  | string;

export class TypeCheckError extends TypeError {
  statusCode = 400;
  status = 400;
  constructor(message: string) {
    super(message);
  }
}

export type TypeCheckOptions = {
  casualBoolean?: boolean; // default false
};

abstract class TypeChecker {
  abstract type: string;

  abstract check(data: any, options?: TypeCheckOptions): void;

  compile(): TypeChecker {
    return this;
  }
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

class OrObjectTypeChecker extends TypeChecker {
  constructor(
    private left: ObjectTypeChecker,
    private right: ObjectTypeChecker,
  ) {
    super();
  }

  get type(): string {
    return `${this.left.type} | ${this.right.type}`;
  }

  check(data: any, options?: TypeCheckOptions): void {
    return this.compile().check(data, options);
  }

  compile(): TypeChecker {
    return new OrTypeChecker(this.left, this.right);
  }
}

class ObjectTypeChecker extends TypeChecker {
  constructor(public fields: Field[]) {
    super();
  }

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

  check(data: any, options?: TypeCheckOptions): void {
    if (typeof data !== 'object') {
      throw new TypeCheckError('expect object, got: ' + typeof data);
    }
    for (const field of this.fields) {
      if (!field.optional && !(field.name in data)) {
        throw new TypeCheckError(`expect field '${field.name}' but missing`);
      }
      if (field.name in data) {
        field.type.check(data[field.name], options);
      }
    }
    for (const key of Object.keys(data)) {
      if (!this.fields.find(x => x.name === key)) {
        // dev('extra field:', util.inspect({ type: this.type, data }));
        throw new TypeCheckError(`got extra field '${key}'`);
      }
    }
  }

  and(that: ObjectTypeChecker): ObjectTypeChecker {
    // console.log(`merge and:`, util.inspect({ this: this, that }, { depth: 99 }));
    const fields = new Map<string, Field>();
    this.fields.forEach(field => fields.set(field.name, field));

    that.fields.forEach(field => {
      if (!fields.has(field.name)) {
        fields.set(field.name, field);
        return;
      }
      const thisField = fields.get(field.name)!;
      const thatField = field;
      const newField: Field = {
        name: thisField.name,
        optional: thisField.optional && thatField.optional,
        // type: new AndTypeChecker(thisField.type, thatField.type).compile(),
        type: new AndTypeChecker(thisField.type, thatField.type),
      };
      fields.set(newField.name, newField);
    });
    return new ObjectTypeChecker(Array.from(fields.values()));
  }

  /**@deprecated*/
  or(that: ObjectTypeChecker): TypeChecker {
    return new OrObjectTypeChecker(this, that);
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
    throw new TypeCheckError(`expect word, got: '${s[0]}'`);
  }
  return {
    res: s.substring(len),
    data: s.substring(0, len),
  };
}

function expectChar(s: string, c: string) {
  if (s[0] !== c) {
    throw new TypeCheckError(`expect '${c}', got '${s[0]}'`);
  }
}

function parseObjectType(s: string): ParseResult<ObjectTypeChecker> {
  if (s.length === 0) {
    throw new TypeCheckError('empty type');
  }
  if (s[0] !== '{') {
    throw new TypeCheckError(`expect '{' got '${s[0]}'`);
  }
  s = s.substring(1);
  const fields: Field[] = [];
  for (;;) {
    s = s.trim();
    const c = s[0];

    if (c === '}') {
      s = s.substring(1);
      return {
        res: s,
        data: new ObjectTypeChecker(fields),
      };
    }

    let fieldName: string;
    {
      const res = parseObjectKey(s);
      fieldName = res.data;
      s = res.res.trim();
    }

    let fieldOptional = false;
    if (s[0] === '?') {
      fieldOptional = true;
      s = s.substring(1).trim();
    }

    expectChar(s, ':');
    s = s.substring(1).trim();

    let fieldType: TypeChecker;
    {
      devStr('parseType for field ' + fieldName, s);
      const res = parseType(s);
      fieldType = res.data;
      s = res.res.trim();
    }
    switch (s[0]) {
      case ',':
      case ';':
        s = s.substring(1).trim();
    }

    fields.push({
      name: fieldName,
      optional: fieldOptional,
      type: fieldType,
    });
  }
}

function parseStringValue(s: string): ParseResult<string> {
  if (s.length === 0) {
    throw new TypeCheckError('empty type');
  }
  if (s.length < 1) {
    throw new TypeCheckError(
      'expect string, but only got length of ' + s.length,
    );
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
          data: acc,
        };
      default:
        acc += c;
    }
  }
  throw new Error(`expect string, but missing closing quote: ${q}`);
}

function parseStringType(s: string): ParseResult<LiteralChecker<string>> {
  const res = parseStringValue(s);
  return {
    res: res.res,
    data: new LiteralChecker<string>(res.data),
  };
}

function isDigit(c: string): boolean {
  return '0' <= c && c <= '9';
}

class LiteralChecker<T> extends TypeChecker {
  type = 'literal ' + JSON.stringify(this.value);

  constructor(private value: T) {
    super();
  }

  check(data: any, options?: TypeCheckOptions): void {
    if (data !== this.value) {
      throw new TypeCheckError(
        `expect ${this.type}, got: ${JSON.stringify(data)}`,
      );
    }
  }
}

function parseIntStr(s: string): ParseResult<string> {
  s = s.trim();
  if (s.length === 0) {
    throw new TypeCheckError('empty type string, expect integer');
  }
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (!isDigit(c)) {
      if (i === 0) {
        throw new TypeCheckError(`expect integer, got: ${c}`);
      }
      return {
        res: s.substring(i),
        data: s.substring(0, i),
      };
    }
  }
  return { res: '', data: s };
}

// TODO support e+<int> and e-<int>
function parseNumberValue(s: string): ParseResult<number> {
  const a = parseIntStr(s);
  s = a.res.trim();
  let num = a.data;
  if (s[0] === '.') {
    s = s.substring(1);
    const b = parseIntStr(s);
    s = b.res.trim();
    num = a + '.' + b;
  }
  return {
    res: s,
    data: +num,
  };
}

function parseNumberType(s: string): ParseResult<LiteralChecker<number>> {
  const res = parseNumberValue(s);
  return {
    res: res.res,
    data: new LiteralChecker<number>(res.data),
  };
}

function getSimpleType(data: any): string {
  const type = typeof data;
  if (type === 'object') {
    if (data === null) return 'null';
    if (Array.isArray(data)) return 'Array';
    if (data instanceof Date) return 'Date';
  }
  return type;
}

class ArrayChecker extends TypeChecker {
  constructor(private elementType: TypeChecker) {
    super();
  }

  get type(): string {
    return `Array<${this.elementType.type}>`;
  }

  check(data: any, options?: TypeCheckOptions): void {
    if (!Array.isArray(data)) {
      throw new TypeCheckError(`expect array, got: ` + getSimpleType(data));
    }
    for (const datum of data) {
      this.elementType.check(datum, options);
    }
  }
}

function parseArray(s: string): ParseResult<ArrayChecker> {
  const prefixRes = parseWord(s);
  if (prefixRes.data !== 'Array') {
    throw new TypeCheckError('expect array type, got: ' + JSON.stringify(s));
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

class BooleanChecker extends TypeChecker {
  type: string = 'boolean';
  check(data: any, options?: TypeCheckOptions): void {
    if (typeof data === 'boolean') return;
    if (options?.casualBoolean === true) {
      if (data === 0 || data === 1) return;
    }
    throw new TypeCheckError('expect boolean, got: ' + JSON.stringify(data));
  }
}

class TrueChecker extends TypeChecker {
  type: string = 'true';
  check(data: any, options?: TypeCheckOptions): void {
    if (data === true) return;
    if (data === 1 && options?.casualBoolean) return;
    throw new TypeCheckError('expect true, got: ' + JSON.stringify(data));
  }
}

class FalseChecker extends TypeChecker {
  type: string = 'false';
  check(data: any, options?: TypeCheckOptions): void {
    if (data === false) return;
    if (data === 0 && options?.casualBoolean) return;
    throw new TypeCheckError('expect false, got: ' + JSON.stringify(data));
  }
}

class StringChecker extends TypeChecker {
  type: string = 'string';
  check(data: any, options?: TypeCheckOptions): void {
    if (typeof data === 'string') return;
    throw new TypeCheckError('expect string, got: ' + JSON.stringify(data));
  }
}

class NumberChecker extends TypeChecker {
  type: string = 'number';
  check(data: any, options?: TypeCheckOptions): void {
    if (typeof data === 'number') return;
    throw new TypeCheckError('expect number, got: ' + JSON.stringify(data));
  }
}

class DateChecker extends TypeChecker {
  type: string = 'Date';
  check(data: any, options?: TypeCheckOptions): void {
    if (data instanceof Date) return;
    throw new TypeCheckError('expect Date, got: ' + JSON.stringify(data));
  }
}

const nativeTypeCheckers = {
  string: new StringChecker(),
  number: new NumberChecker(),
  Date: new DateChecker(),
  boolean: new BooleanChecker(),
  true: new TrueChecker(),
  false: new FalseChecker(),
};

function parseOneType(s: string): ParseResult<TypeChecker> {
  s = s.trim();
  if (s.length === 0) {
    throw new Error('empty type');
  }
  if (s.startsWith('{')) {
    devStr('parseObjectType', s);
    return parseObjectType(s);
  }
  for (const typeStr of [
    'string',
    'number',
    'Date',
    'boolean',
    'true',
    'false',
  ] as const) {
    if (s.startsWith(typeStr)) {
      const nextC = s[typeStr.length];
      if (!isWordChar(nextC)) {
        const type: TypeChecker = nativeTypeCheckers[typeStr];
        return {
          res: s.substring(typeStr.length),
          data: type,
        };
      }
    }
  }
  switch (s[0]) {
    case '"':
    case "'": {
      return parseStringType(s);
    }
    default: {
      if (isDigit(s[0])) {
        return parseNumberType(s);
      }
    }
  }
  {
    devStr('parseWord:', s);
    const prefixRes = parseWord(s);
    if (prefixRes.data === 'Array') {
      return parseArray(s);
    }
    return {
      res: prefixRes.res,
      data: new LiteralChecker<string>(prefixRes.data),
    };
  }
}

function parseObjectKey(s: string): ParseResult<string> {
  s = s.trim();
  if (s.length === 0) {
    throw new Error('incomplete type, expect object key');
  }
  switch (s[0]) {
    case '"':
    case "'": {
      return parseStringValue(s);
    }
    default: {
      const match = s.match(/^\w+/);
      if (!match)
        throw new Error('invalid object key, got: ' + JSON.stringify(s));
      const data = match[0];
      const res = s.substring(data.length);
      return { res, data };
    }
  }
}

function toObjectTypeChecker(type: TypeChecker): ObjectTypeChecker | never {
  if (type instanceof ObjectTypeChecker) {
    return type;
  }
  if (
    type instanceof BracketTypeChecker &&
    type.content instanceof ObjectTypeChecker
  ) {
    return type.content;
  }
  throw new Error('expect object type checker');
}

function isObjectTypeChecker(type: TypeChecker): boolean {
  return !!toObjectTypeChecker(type);
}

class OrTypeChecker extends TypeChecker {
  static lastErrors: Error[];

  constructor(public left: TypeChecker, public right: TypeChecker) {
    super();
  }

  get type(): string {
    return this.left.type + ' | ' + this.right.type;
  }

  check(data: any, options?: TypeCheckOptions): void {
    const errors: Error[] = [];
    for (const type of [this.left, this.right]) {
      try {
        type.check(data, options);
        return;
      } catch (e: any) {
        errors.push(e);
      }
    }
    OrTypeChecker.lastErrors = errors;
    throw new TypeCheckError(
      `failed all type check of OrType, type: ${this.type}, errors: ${errors
        .map(e => e.toString())
        .join(' | ')}`,
    );
  }

  compile(): TypeChecker {
    return new OrTypeChecker(this.left.compile(), this.right.compile());
  }
}

class AndTypeChecker extends TypeChecker {
  constructor(public left: TypeChecker, public right: TypeChecker) {
    super();
  }

  get type(): string {
    return this.left.type + ' & ' + this.right.type;
  }

  check(data: any, options?: TypeCheckOptions): void {
    const type = this.compile();
    if (type !== this) {
      // throw new Error('not compiled');
      return type.check(data, options);
    }
    this.left.check(data, options);
    this.right.check(data, options);
  }

  compile(): TypeChecker {
    if ('dev') {
      if (this.left instanceof OrTypeChecker) {
        return new OrTypeChecker(
          new AndTypeChecker(this.left.left, this.right).compile(),
          new AndTypeChecker(this.left.right, this.right).compile(),
        ).compile();
      }
      if (
        this.left instanceof BracketTypeChecker &&
        this.left.content instanceof OrTypeChecker
      ) {
        return new OrTypeChecker(
          new AndTypeChecker(this.left.content.left, this.right).compile(),
          new AndTypeChecker(this.left.content.right, this.right).compile(),
        ).compile();
      }
      if (this.right instanceof OrTypeChecker) {
        return new OrTypeChecker(
          new AndTypeChecker(this.left, this.right.left).compile(),
          new AndTypeChecker(this.left, this.right.right).compile(),
        ).compile();
      }
      if (
        this.right instanceof BracketTypeChecker &&
        this.right.content instanceof OrTypeChecker
      ) {
        return new OrTypeChecker(
          new AndTypeChecker(this.left, this.right.content.left).compile(),
          new AndTypeChecker(this.left, this.right.content.right).compile(),
        ).compile();
      }
      if (isObjectTypeChecker(this.left) && isObjectTypeChecker(this.right)) {
        return toObjectTypeChecker(this.left).and(
          toObjectTypeChecker(this.right),
        );
      }
    }
    return this;
  }
}

type LogicTerm = TypeChecker | '|' | '&';

/**
 * & has higher binding order than |
 * */
class LogicTypeChecker extends TypeChecker {
  constructor(private terms: LogicTerm[]) {
    super();
  }

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
              // ys.push(new AndTypeChecker(left, right).compile());
              ys.push(new AndTypeChecker(left, right));
              break;
            case '|':
              // ys.push(new OrTypeChecker(left, right).compile());
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

  check(data: any, options?: TypeCheckOptions): void {
    this.compile().check(data, options);
  }
}

class BracketTypeChecker<
  T extends TypeChecker = TypeChecker,
> extends TypeChecker {
  constructor(public content: T) {
    super();
  }

  get type(): string {
    return `(${this.content.type})`;
  }

  check(data: any, options?: TypeCheckOptions): void {
    this.content.check(data, options);
  }

  compile(): TypeChecker {
    return new BracketTypeChecker(this.content.compile());
  }
}

type BracketTerm = LogicTerm | '(' | ')';

function compileBracket(terms: BracketTerm[]): LogicTerm[] {
  const stack: Array<LogicTerm | LogicTypeChecker | '('> = [];
  for (const term of terms) {
    switch (term) {
      case ')':
        const idx = stack.lastIndexOf('(');
        if (idx === -1) {
          console.error('missing open bracket, terms:', terms);
          throw new Error('missing open bracket');
        }
        const logicTerms = stack.splice(idx + 1, stack.length);
        stack.pop();
        stack.push(
          new BracketTypeChecker(
            new LogicTypeChecker(logicTerms as LogicTerm[]).compile(),
          ),
        );
        break;
      default:
        stack.push(term);
    }
  }
  return stack as LogicTerm[];
}

function parseType(s: string): ParseResult<TypeChecker> {
  const originalS = s;
  const terms: BracketTerm[] = [];
  let isTerm = false;
  s = s.trim();
  main: for (; s.length > 0; ) {
    const c = s[0];
    switch (c) {
      case '(':
      case ')':
      case '|':
      case '&': {
        isTerm = true;
        s = s.substring(1).trim();
        terms.push(c);
        break;
      }
      default:
        if (terms.length === 1) {
          const first = terms[0];
          if (typeof first !== 'string') {
            return {
              res: s,
              data: first,
            };
          }
        }
        if (s[0] === '}' && terms.length > 0) {
          break main;
        }
        devStr('parseOneType:', originalS);
        const res = parseOneType(s);
        s = res.res.trim();
        terms.push(res.data);
    }
  }
  if (!isTerm) {
    return parseOneType(originalS);
  }
  const type = new LogicTypeChecker(compileBracket(terms)).compile();
  return {
    res: s,
    data: type,
  };
}

export function parseTsType(type: Type): TypeChecker {
  switch (type) {
    case 'string':
    case 'number':
    case 'Date':
    case 'boolean':
    case 'true':
    case 'false':
      return nativeTypeCheckers[type];
  }
  const res = parseType(type);
  if (res.res !== '') {
    console.error('unknown type:', type);
    throw new Error(
      `failed to parse type, reminding type string: '${res.res}'`,
    );
  }
  return res.data.compile();
}

/**
 * only check for json-compatible types
 *
 * @throws TypeCheckError if failed
 * */
export function checkTsType(
  type: Type,
  data: any,
  options?: TypeCheckOptions,
): void {
  let typeChecker = parseTsType(type);
  typeChecker.check(data, options);
}
