// import * as util from 'util';

const dev = (...args) => {
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

export type Type = 'string' | 'number' | 'Date' | 'boolean' | string;

abstract class TypeChecker {
  abstract type: string;

  abstract check(data: any): void;

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

  check(data: any): void {
    return this.compile().check(data);
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
        // dev('extra field:', util.inspect({ type: this.type, data }));
        throw new Error(`got extra field '${key}'`);
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
      const thisField = fields.get(field.name);
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
    // console.log(`merge or:`, util.inspect({ this: this, that }, { depth: 99 }));
    const fields = new Map<string, Field>();
    this.fields.forEach(field => fields.set(field.name, field));

    that.fields.forEach(({ name, optional, type }) => {
      if (fields.has(name)) {
        // to merge
        const oldField = fields.get(name);
        if (oldField.type === type) {
          return;
        }
        fields.set(name, {
          name,
          optional: oldField.optional && optional,
          // type: new OrTypeChecker(oldField.type, type).compile(),
          type: new OrTypeChecker(oldField.type, type),
        });
      } else {
        // to allow extra
        fields.set(name, {
          name,
          type,
          optional: true,
        });
      }
    });

    return new ObjectTypeChecker(Array.from(fields.values()));
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

function parseObjectType(s: string): ParseResult<ObjectTypeChecker> {
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
        data: new ObjectTypeChecker(fields),
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
      devStr('parseType for field ' + fieldName, s);
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

class StringChecker extends TypeChecker {
  constructor(private value: string) {
    super();
  }

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

class ArrayChecker extends TypeChecker {
  constructor(private elementType: TypeChecker) {
    super();
  }

  get type(): string {
    return `Array<${this.elementType.type}>`;
  }

  check(data: any): void {
    if (!Array.isArray(data)) {
      throw new Error(`expect array, got: ` + getObjectType(data));
    }
    for (const datum of data) {
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

function makeNativeTypeChecker(type: Type): TypeChecker {
  return new (class extends TypeChecker {
    type: string = type;

    check(data: any): void {
      checkTsType(type, data);
    }
  })();
}

const nativeTypeCheckers = {
  string: makeNativeTypeChecker('string'),
  number: makeNativeTypeChecker('number'),
  Date: makeNativeTypeChecker('Date'),
  boolean: makeNativeTypeChecker('boolean'),
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
  for (const typeStr of ['string', 'number', 'Date', 'boolean']) {
    if (s.startsWith(typeStr)) {
      const nextC = s[typeStr.length];
      if (!isWordChar(nextC)) {
        const type: TypeChecker = nativeTypeCheckers[typeStr];
        return {
          res: s.substr(typeStr.length),
          data: type,
        };
      }
    }
  }
  switch (s[0]) {
    case '"':
    case "'": {
      return parseString(s);
    }
  }
  {
    devStr('parseWord:', s);
    const prefixRes = parseWord(s);
    if (prefixRes.data === 'Array') {
      return parseArray(s);
    }
  }
}

function toObjectTypeChecker(type: TypeChecker): ObjectTypeChecker | undefined {
  if (type instanceof ObjectTypeChecker) {
    return type;
  }
  if (
    type instanceof BracketTypeChecker &&
    type.content instanceof ObjectTypeChecker
  ) {
    return type.content;
  }
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

  check(data: any): void {
    const errors: Error[] = [];
    for (const type of [this.left, this.right]) {
      try {
        type.check(data);
        return;
      } catch (e) {
        errors.push(e);
      }
    }
    OrTypeChecker.lastErrors = errors;
    throw new Error(
      `failed all type check of OrType, type: ${
        this.type
      }, errors: ${errors.map(e => e.toString()).join(' | ')}`,
    );
  }

  compile(): TypeChecker {
    return new OrTypeChecker(this.left.compile(), this.right.compile());
    // return this;
    // console.log(`compile or:`, util.inspect(this, { depth: 99 }));
    const compileSelf = (): TypeChecker =>
      new OrTypeChecker(this.left.compile(), this.right.compile());
    const left = toObjectTypeChecker(this.left);
    if (!left) {
      return compileSelf();
    }
    const right = toObjectTypeChecker(this.right);
    if (!right) {
      return compileSelf();
    }
    return left.or(right);
    // return new OrTypeChecker(left.or(right), right.or(left));
  }
}

class AndTypeChecker extends TypeChecker {
  constructor(public left: TypeChecker, public right: TypeChecker) {
    super();
  }

  get type(): string {
    return this.left.type + ' & ' + this.right.type;
  }

  check(data: any): void {
    const type = this.compile();
    if (type !== this) {
      // throw new Error('not compiled');
      return type.check(data);
    }
    this.left.check(data);
    this.right.check(data);
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

  check(data: any): void {
    this.compile().check(data);
  }
}

class BracketTypeChecker<
  T extends TypeChecker = TypeChecker
> extends TypeChecker {
  constructor(public content: T) {
    super();
  }

  get type(): string {
    return `(${this.content.type})`;
  }

  check(data: any): void {
    this.content.check(data);
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

export function parseType(s: string): ParseResult<TypeChecker> {
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
        s = s.substr(1).trim();
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
      dev('raw type:', type);
      dev('parsed type:', res.data.type);
      const compiledType = res.data.compile();
      dev('compiled type:', compiledType.type);
      // dev('checker:', util.inspect(compiledType, { depth: 99 }));
      compiledType.check(data);
    }
  }
}
