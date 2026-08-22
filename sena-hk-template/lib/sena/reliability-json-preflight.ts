import {
  SENA_RELIABILITY_UNIVERSE_LIMITS,
  SenaReliabilityUniverseLimitError
} from "./reliability";

const SENA_RELIABILITY_JSON_NESTING_DEPTH = 512;
const SENA_RELIABILITY_JSON_KEY_CAPTURE_LENGTH = 32;

export type SenaReliabilityJsonTextPreflightOptions = {
  mode: "request" | "source";
  maximumRows?: number;
  maximumSources?: number;
  consumedRows?: number;
  consumedSources?: number;
};

export type SenaReliabilityJsonTextPreflight = {
  rawRows: number;
  sources: number;
};

type SenaJsonObjectRole = "generic" | "request-root" | "source-root" | "source-value";
type SenaJsonArrayRole = "generic" | "row-array" | "files-array";
type SenaJsonAlias = "annotations" | "rows" | "data";

type SenaJsonObjectFrame = {
  type: "object";
  role: SenaJsonObjectRole;
  state: "key-or-end" | "key" | "colon" | "value" | "comma-or-end";
  key?: string;
  sourceCountAtOpen: number;
  finalAliasIsArray: Partial<Record<SenaJsonAlias, boolean>>;
};

type SenaJsonArrayFrame = {
  type: "array";
  role: SenaJsonArrayRole;
  state: "value-or-end" | "value" | "comma-or-end";
};

type SenaJsonFrame = SenaJsonObjectFrame | SenaJsonArrayFrame;

type SenaJsonToken =
  | { type: "{" | "}" | "[" | "]" | ":" | "," }
  | { type: "string"; value?: string }
  | { type: "primitive" };

type SenaJsonLexicalMode =
  | "default"
  | "string"
  | "string-escape"
  | "string-unicode"
  | "literal"
  | "number";

type SenaJsonNumberState = "minus" | "zero" | "integer" | "dot" | "fraction" | "exp" | "exp-sign" | "exp-digits";

function checkedPreflightInteger(value: number | undefined, fallback: number, label: string) {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw new Error(`Reliability JSON ${label} must be a non-negative safe integer.`);
  }
  return resolved;
}

function isAlias(value: string | undefined): value is SenaJsonAlias {
  return value === "annotations" || value === "rows" || value === "data";
}

function isWhitespace(value: string) {
  return value === " " || value === "\n" || value === "\r" || value === "\t";
}

function isDigit(value: string) {
  return value >= "0" && value <= "9";
}

function isNonZeroDigit(value: string) {
  return value >= "1" && value <= "9";
}

function hexDigitValue(value: string) {
  if (value >= "0" && value <= "9") return value.charCodeAt(0) - 48;
  if (value >= "a" && value <= "f") return value.charCodeAt(0) - 87;
  if (value >= "A" && value <= "F") return value.charCodeAt(0) - 55;
  return -1;
}

/**
 * Incremental, non-materializing JSON lexical/structural admission scanner.
 *
 * The scanner retains only its bounded parser stack, a key prefix of at most
 * 32 UTF-16 code units, and scalar-token state. It never retains row values or
 * an aggregate copy of the body. Every raw occurrence of a reliability alias
 * is charged even though JSON.parse later applies last-key-wins semantics.
 */
export class SenaReliabilityJsonPreflightScanner {
  private readonly maximumRows: number;
  private readonly maximumSources: number;
  private readonly consumedRows: number;
  private readonly consumedSources: number;
  private readonly frames: SenaJsonFrame[] = [];
  private rootState: "value" | "done" = "value";
  private lexicalMode: SenaJsonLexicalMode = "default";
  private numberState: SenaJsonNumberState = "integer";
  private literalExpected = "";
  private literalIndex = 0;
  private captureString = false;
  private capturedString = "";
  private capturedStringValid = true;
  private unicodeValue = 0;
  private unicodeDigits = 0;
  private rawRows = 0;
  private sources = 0;
  private position = 0;
  private finished = false;

  constructor(private readonly options: SenaReliabilityJsonTextPreflightOptions) {
    this.maximumRows = checkedPreflightInteger(
      options.maximumRows,
      SENA_RELIABILITY_UNIVERSE_LIMITS.rawRows,
      "maximumRows"
    );
    this.maximumSources = checkedPreflightInteger(
      options.maximumSources,
      SENA_RELIABILITY_UNIVERSE_LIMITS.sources,
      "maximumSources"
    );
    this.consumedRows = checkedPreflightInteger(options.consumedRows, 0, "consumedRows");
    this.consumedSources = checkedPreflightInteger(options.consumedSources, 0, "consumedSources");
    if (this.consumedRows > this.maximumRows) this.throwRowLimit(this.consumedRows);
    if (this.consumedSources > this.maximumSources) this.throwSourceLimit(this.consumedSources);
  }

  private syntax(message: string): never {
    throw new SyntaxError(`Invalid JSON reliability input at character ${this.position}: ${message}`);
  }

  private throwRowLimit(actual: number): never {
    throw new SenaReliabilityUniverseLimitError([{
      path: "annotations",
      rule: `raw-row-count-at-most-${this.maximumRows}`,
      actual,
      maximum: this.maximumRows
    }]);
  }

  private throwSourceLimit(actual: number): never {
    throw new SenaReliabilityUniverseLimitError([{
      path: "files",
      rule: `source-count-at-most-${this.maximumSources}`,
      actual,
      maximum: this.maximumSources
    }]);
  }

  private addRow() {
    if (this.rawRows >= Number.MAX_SAFE_INTEGER ||
      this.consumedRows > Number.MAX_SAFE_INTEGER - this.rawRows - 1) {
      throw new SenaReliabilityUniverseLimitError([{
        path: "annotations",
        rule: `raw-row-count-at-most-${this.maximumRows}`,
        actual: "safe-integer-overflow",
        maximum: this.maximumRows
      }]);
    }
    this.rawRows += 1;
    const actual = this.consumedRows + this.rawRows;
    if (actual > this.maximumRows) this.throwRowLimit(actual);
  }

  private addSource() {
    if (this.sources >= Number.MAX_SAFE_INTEGER ||
      this.consumedSources > Number.MAX_SAFE_INTEGER - this.sources - 1) {
      throw new SenaReliabilityUniverseLimitError([{
        path: "files",
        rule: `source-count-at-most-${this.maximumSources}`,
        actual: "safe-integer-overflow",
        maximum: this.maximumSources
      }]);
    }
    this.sources += 1;
    const actual = this.consumedSources + this.sources;
    if (actual > this.maximumSources) this.throwSourceLimit(actual);
  }

  private pushObject(role: SenaJsonObjectRole) {
    if (this.frames.length >= SENA_RELIABILITY_JSON_NESTING_DEPTH) {
      throw new SenaReliabilityUniverseLimitError([{
        path: "annotations",
        rule: `json-nesting-depth-at-most-${SENA_RELIABILITY_JSON_NESTING_DEPTH}`,
        actual: this.frames.length + 1,
        maximum: SENA_RELIABILITY_JSON_NESTING_DEPTH
      }]);
    }
    this.frames.push({
      type: "object",
      role,
      state: "key-or-end",
      sourceCountAtOpen: this.sources,
      finalAliasIsArray: {}
    });
  }

  private pushArray(role: SenaJsonArrayRole) {
    if (this.frames.length >= SENA_RELIABILITY_JSON_NESTING_DEPTH) {
      throw new SenaReliabilityUniverseLimitError([{
        path: "annotations",
        rule: `json-nesting-depth-at-most-${SENA_RELIABILITY_JSON_NESTING_DEPTH}`,
        actual: this.frames.length + 1,
        maximum: SENA_RELIABILITY_JSON_NESTING_DEPTH
      }]);
    }
    this.frames.push({ type: "array", role, state: "value-or-end" });
  }

  private beginCompositeOrPrimitive(token: SenaJsonToken, objectRole: SenaJsonObjectRole, arrayRole: SenaJsonArrayRole) {
    if (token.type === "{") {
      this.pushObject(objectRole);
      return;
    }
    if (token.type === "[") {
      this.pushArray(arrayRole);
      return;
    }
    if (token.type !== "string" && token.type !== "primitive") this.syntax("expected a JSON value");
  }

  private beginRootValue(token: SenaJsonToken) {
    this.rootState = "done";
    if (this.options.mode === "request") {
      if (token.type === "{") {
        this.pushObject("request-root");
        return;
      }
      this.addSource();
      if (token.type === "[") {
        this.pushArray("row-array");
        return;
      }
      this.beginCompositeOrPrimitive(token, "generic", "generic");
      return;
    }

    if (token.type === "{") {
      this.pushObject("source-root");
      return;
    }
    this.addSource();
    if (token.type === "[") {
      this.pushArray("row-array");
      return;
    }
    this.beginCompositeOrPrimitive(token, "generic", "generic");
  }

  private beginArrayValue(frame: SenaJsonArrayFrame, token: SenaJsonToken) {
    frame.state = "comma-or-end";
    if (frame.role === "row-array") this.addRow();
    if (frame.role === "files-array") {
      this.addSource();
      if (token.type === "{") {
        this.pushObject("source-value");
        return;
      }
      this.addRow();
    }
    this.beginCompositeOrPrimitive(token, "generic", "generic");
  }

  private beginObjectValue(frame: SenaJsonObjectFrame, token: SenaJsonToken) {
    const key = frame.key;
    frame.key = undefined;
    frame.state = "comma-or-end";

    if (frame.role === "request-root") {
      if (isAlias(key)) {
        this.addSource();
        if (token.type === "[") {
          this.pushArray("row-array");
          return;
        }
        if (token.type === "{") {
          this.pushObject("source-value");
          return;
        }
      } else if (key === "files" && token.type === "[") {
        this.pushArray("files-array");
        return;
      }
      this.beginCompositeOrPrimitive(token, "generic", "generic");
      return;
    }

    if (frame.role === "source-root") {
      if (isAlias(key)) {
        frame.finalAliasIsArray[key] = token.type === "[";
        if (token.type === "[") {
          this.pushArray("row-array");
          return;
        }
      } else if (key === "files" && token.type === "[") {
        this.pushArray("files-array");
        return;
      }
      this.beginCompositeOrPrimitive(token, "generic", "generic");
      return;
    }

    if (frame.role === "source-value" && isAlias(key)) {
      frame.finalAliasIsArray[key] = token.type === "[";
      if (token.type === "[") {
        this.pushArray("row-array");
        return;
      }
    }
    this.beginCompositeOrPrimitive(token, "generic", "generic");
  }

  private closeObject(frame: SenaJsonObjectFrame) {
    if (frame.role === "request-root" || frame.role === "source-root") {
      if (this.sources === frame.sourceCountAtOpen) this.addSource();
    }
    if ((frame.role === "source-root" || frame.role === "source-value") &&
      !Object.values(frame.finalAliasIsArray).some(Boolean)) {
      this.addRow();
    }
    this.frames.pop();
  }

  private consumeToken(token: SenaJsonToken) {
    const frame = this.frames[this.frames.length - 1];
    if (!frame) {
      if (this.rootState !== "value") this.syntax("unexpected content after root value");
      this.beginRootValue(token);
      return;
    }

    if (frame.type === "object") {
      if (frame.state === "key-or-end") {
        if (token.type === "}") {
          this.closeObject(frame);
          return;
        }
        if (token.type !== "string") this.syntax("expected an object key or '}'");
        frame.key = token.value;
        frame.state = "colon";
        return;
      }
      if (frame.state === "key") {
        if (token.type !== "string") this.syntax("expected an object key");
        frame.key = token.value;
        frame.state = "colon";
        return;
      }
      if (frame.state === "colon") {
        if (token.type !== ":") this.syntax("expected ':' after object key");
        frame.state = "value";
        return;
      }
      if (frame.state === "value") {
        this.beginObjectValue(frame, token);
        return;
      }
      if (token.type === ",") {
        frame.state = "key";
        return;
      }
      if (token.type === "}") {
        this.closeObject(frame);
        return;
      }
      this.syntax("expected ',' or '}' in object");
    }

    if (frame.state === "value-or-end") {
      if (token.type === "]") {
        this.frames.pop();
        return;
      }
      this.beginArrayValue(frame, token);
      return;
    }
    if (frame.state === "value") {
      this.beginArrayValue(frame, token);
      return;
    }
    if (token.type === ",") {
      frame.state = "value";
      return;
    }
    if (token.type === "]") {
      this.frames.pop();
      return;
    }
    this.syntax("expected ',' or ']' in array");
  }

  private expectingObjectKey() {
    const frame = this.frames[this.frames.length - 1];
    return frame?.type === "object" && (frame.state === "key-or-end" || frame.state === "key");
  }

  private appendCapturedString(value: string) {
    if (!this.captureString || !this.capturedStringValid) return;
    if (this.capturedString.length + value.length > SENA_RELIABILITY_JSON_KEY_CAPTURE_LENGTH) {
      this.capturedStringValid = false;
      this.capturedString = "";
      return;
    }
    this.capturedString += value;
  }

  private finishString() {
    this.consumeToken({
      type: "string",
      value: this.captureString && this.capturedStringValid ? this.capturedString : undefined
    });
    this.captureString = false;
    this.capturedString = "";
    this.capturedStringValid = true;
    this.lexicalMode = "default";
  }

  private numberAccepting() {
    return this.numberState === "zero" || this.numberState === "integer" ||
      this.numberState === "fraction" || this.numberState === "exp-digits";
  }

  private numberCharacter(value: string) {
    if (this.numberState === "minus") {
      if (value === "0") this.numberState = "zero";
      else if (isNonZeroDigit(value)) this.numberState = "integer";
      else this.syntax("invalid number");
      return true;
    }
    if (this.numberState === "zero") {
      if (value === ".") this.numberState = "dot";
      else if (value === "e" || value === "E") this.numberState = "exp";
      else return false;
      return true;
    }
    if (this.numberState === "integer") {
      if (isDigit(value)) return true;
      if (value === ".") this.numberState = "dot";
      else if (value === "e" || value === "E") this.numberState = "exp";
      else return false;
      return true;
    }
    if (this.numberState === "dot") {
      if (!isDigit(value)) this.syntax("invalid number fraction");
      this.numberState = "fraction";
      return true;
    }
    if (this.numberState === "fraction") {
      if (isDigit(value)) return true;
      if (value === "e" || value === "E") this.numberState = "exp";
      else return false;
      return true;
    }
    if (this.numberState === "exp") {
      if (value === "+" || value === "-") this.numberState = "exp-sign";
      else if (isDigit(value)) this.numberState = "exp-digits";
      else this.syntax("invalid number exponent");
      return true;
    }
    if (this.numberState === "exp-sign") {
      if (!isDigit(value)) this.syntax("invalid number exponent");
      this.numberState = "exp-digits";
      return true;
    }
    if (isDigit(value)) return true;
    return false;
  }

  private processDefaultCharacter(value: string) {
    if (isWhitespace(value)) return;
    if (value === "{") this.consumeToken({ type: "{" });
    else if (value === "}") this.consumeToken({ type: "}" });
    else if (value === "[") this.consumeToken({ type: "[" });
    else if (value === "]") this.consumeToken({ type: "]" });
    else if (value === ":") this.consumeToken({ type: ":" });
    else if (value === ",") this.consumeToken({ type: "," });
    else if (value === "\"") {
      this.lexicalMode = "string";
      this.captureString = this.expectingObjectKey();
      this.capturedString = "";
      this.capturedStringValid = true;
    } else if (value === "t" || value === "f" || value === "n") {
      this.lexicalMode = "literal";
      this.literalExpected = value === "t" ? "true" : value === "f" ? "false" : "null";
      this.literalIndex = 1;
    } else if (value === "-") {
      this.lexicalMode = "number";
      this.numberState = "minus";
    } else if (value === "0") {
      this.lexicalMode = "number";
      this.numberState = "zero";
    } else if (isNonZeroDigit(value)) {
      this.lexicalMode = "number";
      this.numberState = "integer";
    } else {
      this.syntax("expected a JSON token");
    }
  }

  write(chunk: string) {
    if (this.finished) throw new Error("Reliability JSON scanner is already finished.");
    for (let index = 0; index < chunk.length; index += 1) {
      const value = chunk[index];
      let consumed = false;
      while (!consumed) {
        if (this.lexicalMode === "default") {
          this.processDefaultCharacter(value);
          consumed = true;
        } else if (this.lexicalMode === "string") {
          if (value === "\"") this.finishString();
          else if (value === "\\") this.lexicalMode = "string-escape";
          else {
            if (value.charCodeAt(0) < 0x20) this.syntax("unescaped control character in string");
            this.appendCapturedString(value);
          }
          consumed = true;
        } else if (this.lexicalMode === "string-escape") {
          if (value === "u") {
            this.lexicalMode = "string-unicode";
            this.unicodeValue = 0;
            this.unicodeDigits = 0;
          } else {
            const decoded: Record<string, string> = {
              "\"": "\"",
              "\\": "\\",
              "/": "/",
              b: "\b",
              f: "\f",
              n: "\n",
              r: "\r",
              t: "\t"
            };
            if (!(value in decoded)) this.syntax("invalid string escape");
            this.appendCapturedString(decoded[value]);
            this.lexicalMode = "string";
          }
          consumed = true;
        } else if (this.lexicalMode === "string-unicode") {
          const digit = hexDigitValue(value);
          if (digit < 0) this.syntax("invalid unicode escape");
          this.unicodeValue = this.unicodeValue * 16 + digit;
          this.unicodeDigits += 1;
          if (this.unicodeDigits === 4) {
            this.appendCapturedString(String.fromCharCode(this.unicodeValue));
            this.lexicalMode = "string";
          }
          consumed = true;
        } else if (this.lexicalMode === "literal") {
          if (value !== this.literalExpected[this.literalIndex]) this.syntax("invalid literal");
          this.literalIndex += 1;
          if (this.literalIndex === this.literalExpected.length) {
            this.lexicalMode = "default";
            this.consumeToken({ type: "primitive" });
          }
          consumed = true;
        } else {
          if (this.numberCharacter(value)) consumed = true;
          else {
            if (!this.numberAccepting()) this.syntax("invalid number");
            this.lexicalMode = "default";
            this.consumeToken({ type: "primitive" });
          }
        }
      }
      this.position += 1;
    }
    return this;
  }

  finish(): SenaReliabilityJsonTextPreflight {
    if (this.finished) throw new Error("Reliability JSON scanner is already finished.");
    if (this.lexicalMode === "number") {
      if (!this.numberAccepting()) this.syntax("incomplete number");
      this.lexicalMode = "default";
      this.consumeToken({ type: "primitive" });
    } else if (this.lexicalMode !== "default") {
      this.syntax("incomplete JSON token");
    }
    if (this.frames.length > 0) this.syntax("incomplete JSON container");
    if (this.rootState !== "done") this.syntax("expected a root JSON value");
    this.finished = true;
    return { rawRows: this.rawRows, sources: this.sources };
  }
}

export function preflightSenaReliabilityJsonText(
  input: string,
  options: SenaReliabilityJsonTextPreflightOptions
) {
  return new SenaReliabilityJsonPreflightScanner(options).write(input).finish();
}
