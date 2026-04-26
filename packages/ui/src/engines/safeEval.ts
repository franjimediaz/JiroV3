type TokenType = "number" | "string" | "identifier" | "operator" | "punct" | "eof";

type Token = {
  type: TokenType;
  value: string;
};

const EOF: Token = { type: "eof", value: "" };

/**
 * Safe formula evaluator.
 * Supports variables, numbers, strings, true/false/null, + - * /, comparisons,
 * AND/OR/NOT and the functions IF, ISNULL, COALESCE and CASE.
 */
export function safeEval(expr: string, scope: Record<string, any>) {
  if (!expr || typeof expr !== "string") return 0;

  try {
    const parser = new FormulaParser(tokenize(expr), scope);
    return parser.parse();
  } catch (error) {
    console.warn("[safeEval] formula error", { expr, error });
    return null;
  }
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const char = expr[i];

    if (/\s/.test(char)) {
      i++;
      continue;
    }

    if (char === "'" || char === '"') {
      const quote = char;
      let value = "";
      i++;
      while (i < expr.length && expr[i] !== quote) {
        if (expr[i] === "\\" && i + 1 < expr.length) {
          value += expr[i + 1];
          i += 2;
          continue;
        }
        value += expr[i];
        i++;
      }
      if (expr[i] !== quote) throw new Error("String sin cerrar");
      i++;
      tokens.push({ type: "string", value });
      continue;
    }

    if (/\d/.test(char) || (char === "." && /\d/.test(expr[i + 1] || ""))) {
      let value = char;
      i++;
      while (i < expr.length && /[\d.]/.test(expr[i])) {
        value += expr[i];
        i++;
      }
      if (!Number.isFinite(Number(value))) throw new Error(`Numero invalido: ${value}`);
      tokens.push({ type: "number", value });
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      let value = char;
      i++;
      while (i < expr.length && /[A-Za-z0-9_]/.test(expr[i])) {
        value += expr[i];
        i++;
      }
      tokens.push({ type: "identifier", value });
      continue;
    }

    const two = expr.slice(i, i + 2);
    if ([">=", "<=", "!="].includes(two)) {
      tokens.push({ type: "operator", value: two });
      i += 2;
      continue;
    }

    if (["+", "-", "*", "/", "=", ">", "<"].includes(char)) {
      tokens.push({ type: "operator", value: char });
      i++;
      continue;
    }

    if (["(", ")", ","].includes(char)) {
      tokens.push({ type: "punct", value: char });
      i++;
      continue;
    }

    throw new Error(`Caracter no permitido: ${char}`);
  }

  tokens.push(EOF);
  return tokens;
}

class FormulaParser {
  private index = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly scope: Record<string, any>
  ) {}

  parse() {
    const value = this.parseOr();
    if (this.current().type !== "eof") throw new Error(`Token inesperado: ${this.current().value}`);
    return value;
  }

  private parseOr(): any {
    let value = this.parseAnd();
    while (this.matchIdentifier("OR")) {
      value = toBoolean(value) || toBoolean(this.parseAnd());
    }
    return value;
  }

  private parseAnd(): any {
    let value = this.parseComparison();
    while (this.matchIdentifier("AND")) {
      value = toBoolean(value) && toBoolean(this.parseComparison());
    }
    return value;
  }

  private parseComparison(): any {
    let value = this.parseAdditive();

    while (this.current().type === "operator" && ["=", "!=", ">", ">=", "<", "<="].includes(this.current().value)) {
      const operator = this.consume().value;
      const right = this.parseAdditive();
      value = compareValues(value, right, operator);
    }

    return value;
  }

  private parseAdditive(): any {
    let value = this.parseMultiplicative();

    while (this.current().type === "operator" && ["+", "-"].includes(this.current().value)) {
      const operator = this.consume().value;
      const right = this.parseMultiplicative();
      value = operator === "+" ? toNumber(value) + toNumber(right) : toNumber(value) - toNumber(right);
    }

    return value;
  }

  private parseMultiplicative(): any {
    let value = this.parseUnary();
    let usedOperator = false;

    while (this.current().type === "operator" && ["*", "/"].includes(this.current().value)) {
      const operator = this.consume().value;
      const right = this.parseUnary();
      usedOperator = true;
      value = operator === "*" ? toNumber(value) * toNumber(right) : toNumber(value) / toNumber(right);
    }

    return usedOperator && !Number.isFinite(value) ? 0 : value;
  }

  private parseUnary(): any {
    if (this.matchIdentifier("NOT")) return !toBoolean(this.parseUnary());
    if (this.matchOperator("-")) return -toNumber(this.parseUnary());
    if (this.matchOperator("+")) return toNumber(this.parseUnary());
    return this.parsePrimary();
  }

  private parsePrimary(): any {
    const token = this.current();

    if (this.matchPunct("(")) {
      const value = this.parseOr();
      this.expectPunct(")");
      return value;
    }

    if (token.type === "number") {
      this.consume();
      return Number(token.value);
    }

    if (token.type === "string") {
      this.consume();
      return token.value;
    }

    if (token.type === "identifier") {
      const identifier = this.consume().value;
      const upper = identifier.toUpperCase();

      if (upper === "TRUE") return true;
      if (upper === "FALSE") return false;
      if (upper === "NULL") return null;

      if (this.matchPunct("(")) {
        const args = this.parseArguments();
        return callFunction(upper, args);
      }

      return this.scope[identifier];
    }

    throw new Error(`Token inesperado: ${token.value}`);
  }

  private parseArguments(): any[] {
    const args: any[] = [];
    if (this.matchPunct(")")) return args;

    do {
      args.push(this.parseOr());
    } while (this.matchPunct(","));

    this.expectPunct(")");
    return args;
  }

  private current() {
    return this.tokens[this.index] || EOF;
  }

  private consume() {
    const token = this.current();
    this.index++;
    return token;
  }

  private matchIdentifier(value: string) {
    const token = this.current();
    if (token.type === "identifier" && token.value.toUpperCase() === value) {
      this.index++;
      return true;
    }
    return false;
  }

  private matchOperator(value: string) {
    const token = this.current();
    if (token.type === "operator" && token.value === value) {
      this.index++;
      return true;
    }
    return false;
  }

  private matchPunct(value: string) {
    const token = this.current();
    if (token.type === "punct" && token.value === value) {
      this.index++;
      return true;
    }
    return false;
  }

  private expectPunct(value: string) {
    if (!this.matchPunct(value)) throw new Error(`Se esperaba "${value}"`);
  }
}

function callFunction(name: string, args: any[]) {
  if (name === "IF") {
    if (args.length < 3) throw new Error("IF requiere 3 argumentos");
    return toBoolean(args[0]) ? args[1] : args[2];
  }

  if (name === "ISNULL") {
    if (args.length === 0) throw new Error("ISNULL requiere al menos 1 argumento");
    if (args.length === 1) return isNullish(args[0]);
    return isNullish(args[0]) ? args[1] : args[0];
  }

  if (name === "COALESCE") {
    for (const arg of args) {
      if (!isNullish(arg)) return arg;
    }
    return null;
  }

  if (name === "CASE") {
    if (args.length < 3) throw new Error("CASE requiere al menos 3 argumentos");
    const pivot = args[0];
    const hasDefault = args.length % 2 === 0;
    const lastPairEnd = hasDefault ? args.length - 1 : args.length;

    for (let i = 1; i < lastPairEnd; i += 2) {
      if (compareValues(pivot, args[i], "=")) return args[i + 1];
    }

    return hasDefault ? args[args.length - 1] : null;
  }

  throw new Error(`Funcion no soportada: ${name}`);
}

function isNullish(value: any) {
  return value === undefined || value === null || value === "";
}

function toNumber(value: any) {
  if (isNullish(value)) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toBoolean(value: any) {
  if (isNullish(value)) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0 && Number.isFinite(value);
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return normalized !== "";
}

function compareValues(left: any, right: any, operator: string) {
  const leftValue = normalizeComparable(left);
  const rightValue = normalizeComparable(right);

  if (operator === "=") return leftValue === rightValue;
  if (operator === "!=") return leftValue !== rightValue;

  if (typeof leftValue === "number" && typeof rightValue === "number") {
    if (operator === ">") return leftValue > rightValue;
    if (operator === ">=") return leftValue >= rightValue;
    if (operator === "<") return leftValue < rightValue;
    if (operator === "<=") return leftValue <= rightValue;
  }

  const leftString = String(leftValue);
  const rightString = String(rightValue);
  if (operator === ">") return leftString > rightString;
  if (operator === ">=") return leftString >= rightString;
  if (operator === "<") return leftString < rightString;
  if (operator === "<=") return leftString <= rightString;
  return false;
}

function normalizeComparable(value: any) {
  if (isNullish(value)) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(value);
  if (String(value).trim() !== "" && Number.isFinite(parsed)) return parsed;
  return String(value);
}
