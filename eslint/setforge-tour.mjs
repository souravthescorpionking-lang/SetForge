// ─────────────────────────────────────────────────────────────────────────────
// eslint-plugin-setforge-tour (local, Part 7 LAW 2/LAW 1 enforcement).
//
// Wired into eslint.config.mjs as the "setforge-tour" plugin. Rules:
//   tour/screen-registered  — every src/features/screens/*.tsx calls
//                             registerScreen({...})            [error when strict]
//   tour/static             — tourAttrs/tour/declareTour literals must be
//                             static (no identifiers/templates)  [error]
//   tour/help-length        — help ≤ 90 chars, label ≤ 3 words,
//                             purpose ≤ 120 chars                [error]
//   tour/unique-id          — no duplicate tour ids in one file  [error]
//   tour/required           — interactive elements declare a tour
//                             (self or an ancestor ≤ 2 levels)   [warn]
//   tour/no-content-files   — no hand-written tour content files  [error]
// ─────────────────────────────────────────────────────────────────────────────

const SCREENS_PATH = "src/features/screens";

function rel(context) {
  const f = context.filename || context.getFilename() || "";
  return f.split(/[\\/]/).join("/");
}

function srcText(context) {
  return context.sourceCode.getText();
}

/** Extract a static string value for `key` from an object-literal text. */
function staticString(objText, key) {
  const re = new RegExp(`${key}\\s*:\\s*(["'])((?:\\\\.|(?!\\1).)*)\\1`);
  const m = re.exec(objText);
  if (!m) return undefined;
  try {
    return JSON.parse(`"${m[2].replace(/\\'/g, "'").replace(/"/g, '\\"')}"`);
  } catch {
    return m[2];
  }
}

const tourRules = {
  /** LAW 2 — every screen registers itself. */
  "screen-registered": {
    meta: { type: "problem", schema: [], messages: { missing: "Screen file must call registerScreen({ id, title, purpose }) once (tour LAW 2)." } },
    create(context) {
      const file = rel(context);
      if (!file.includes(`${SCREENS_PATH}/`) || !file.endsWith(".tsx")) return {};
      if (!/registerScreen\s*\(/.test(srcText(context))) {
        const ast = context.sourceCode.ast;
        context.report({ node: ast, messageId: "missing" });
      }
      return {};
    },
  },

  /** Declarations must be statically analysable (codegen requirement). */
  static: {
    meta: { type: "problem", schema: [], messages: { dynamic: "Tour declaration must use static string/number literals (codegen cannot read dynamic values)." } },
    create(context) {
      const checkObj = (node, objNode) => {
        if (!objNode) return;
        const text = context.sourceCode.getText(objNode);
        for (const key of ["id", "label", "help", "order", "purpose", "reason"]) {
          const dynamic = new RegExp(`${key}\\s*:\\s*(\`|[A-Za-z_$][\\w$]*\\s*[,}\\n])`).exec(text);
          const isStatic = new RegExp(`${key}\\s*:\\s*(["']|-?\\d)`).exec(text);
          if (dynamic && !isStatic) {
            context.report({ node, messageId: "dynamic" });
            return;
          }
        }
      };
      const visitors = {
        CallExpression(node) {
          const callee = node.callee;
          const name = callee.type === "Identifier" ? callee.name : "";
          if (name === "tourAttrs" || name === "declareTour" || name === "registerScreen") {
            checkObj(node, node.arguments[0]);
          }
        },
      };
      // JSXAttribute `tour={...}` (guarded — plain espree has no JSX)
      visitors.JSXAttribute = (node) => {
        if (node.name && node.name.type === "JSXIdentifier" && node.name.name === "tour") {
          const v = node.value;
          if (!v) return;
          if (v.type === "JSXExpressionContainer" && v.expression && v.expression.type === "ObjectExpression") {
            checkObj(node, v.expression);
          } else if (v.type === "JSXExpressionContainer") {
            context.report({ node, messageId: "dynamic" });
          }
        }
      };
      return visitors;
    },
  },

  /** Content limits (from the Part 7 spec). */
  "help-length": {
    meta: { type: "problem", schema: [], messages: { help: "help is {{n}} chars (max 90).", label: "label has {{n}} words (max 3).", purpose: "purpose/reason is {{n}} chars (limit 120 / min 10)." } },
    create(context) {
      const check = (node, objNode) => {
        if (!objNode) return;
        const text = context.sourceCode.getText(objNode);
        const help = staticString(text, "help");
        if (typeof help === "string" && help.length > 90) {
          context.report({ node, messageId: "help", data: { n: help.length } });
        }
        const label = staticString(text, "label");
        if (typeof label === "string") {
          const words = label.trim().split(/\s+/).filter(Boolean).length;
          if (words > 3) context.report({ node, messageId: "label", data: { n: words } });
        }
        const purpose = staticString(text, "purpose");
        if (typeof purpose === "string" && purpose.length > 120) {
          context.report({ node, messageId: "purpose", data: { n: purpose.length } });
        }
        const reason = staticString(text, "reason");
        if (typeof reason === "string" && reason.trim().length < 10) {
          context.report({ node, messageId: "purpose", data: { n: reason.length } });
        }
      };
      return {
        CallExpression(node) {
          const callee = node.callee;
          const name = callee.type === "Identifier" ? callee.name : "";
          if (name === "tourAttrs" || name === "declareTour" || name === "registerScreen") {
            check(node, node.arguments[0]);
          }
        },
        JSXAttribute(node) {
          if (node.name && node.name.type === "JSXIdentifier" && node.name.name === "tour") {
            const v = node.value;
            if (v && v.type === "JSXExpressionContainer" && v.expression && v.expression.type === "ObjectExpression") {
              check(node, v.expression);
            }
          }
        },
      };
    },
  },

  /** No exact duplicate declarations in a file (state VARIANTS with the same
   *  id but different `when`/help are legitimate; cross-file collisions are
   *  caught by `pnpm tour:check`). */
  "unique-id": {
    meta: { type: "problem", schema: [], messages: { dup: "Exact duplicate tour declaration \"{{id}}\" in this file (identical help+order)." } },
    create(context) {
      const seen = new Map();
      const check = (node, objNode) => {
        if (!objNode) return;
        const text = context.sourceCode.getText(objNode);
        const id = staticString(text, "id");
        if (typeof id !== "string") return;
        const help = staticString(text, "help");
        const order = new RegExp("order\\s*:\\s*(-?\\d+)").exec(text);
        const key = `${id}::${help}::${order ? order[1] : "?"}`;
        if (seen.has(key)) context.report({ node, messageId: "dup", data: { id } });
        seen.set(key, true);
      };
      return {
        CallExpression(node) {
          const callee = node.callee;
          const name = callee.type === "Identifier" ? callee.name : "";
          if (name === "tourAttrs" || name === "declareTour") check(node, node.arguments[0]);
        },
        JSXAttribute(node) {
          if (node.name && node.name.type === "JSXIdentifier" && node.name.name === "tour") {
            const v = node.value;
            if (v && v.type === "JSXExpressionContainer" && v.expression && v.expression.type === "ObjectExpression") {
              check(node, v.expression);
            }
          }
        },
      };
    },
  },

  /**
   * LAW 2 — interactive elements are tour-declared (self, or an ancestor
   * within 2 levels carries data-tour-id). Warn during migration; the
   * reverse-coverage CI audit is the hard gate.
   */
  required: {
    meta: { type: "suggestion", schema: [], messages: { undeclared: "<{{tag}}> interactive element has no tour declaration. Add tour={{…}} / data-tour-id, or tour={{ skipTour: true, reason: '…' }}." } },
    create(context) {
      const file = rel(context);
      const inScope =
        (file.includes("src/features/") || file.includes("src/components/exercise-card") || file.includes("src/components/set-row") || file.includes("src/components/shared")) &&
        file.endsWith(".tsx") &&
        !file.includes("src/features/tour/"); // the tour UI itself is exempt
      if (!inScope) return {};

      const INTERACTIVE_TAGS = new Set(["button", "input", "select", "textarea"]);
      const INTERACTIVE_ROLES = new Set(["button", "menuitem", "tab", "switch", "checkbox", "radio", "option", "combobox", "searchbox", "slider"]);
      const PRIMITIVE_ROOTS = new Set(["Button", "Switch", "Checkbox", "RadioGroup", "Slider", "Input", "Textarea", "Select", "TabsTrigger", "Toggle"]);

      const attrName = (a) => (a.type === "JSXAttribute" && a.name && a.name.type === "JSXIdentifier" ? a.name.name : null);

      const hasTourAttr = (open) =>
        open.attributes.some((a) => {
          const n = attrName(a);
          if (n === "data-tour-id" || n === "tour") return true;
          if (a.type === "JSXSpreadAttribute") {
            // {...tourAttrs({...})}
            const expr = a.argument;
            if (expr && expr.type === "CallExpression" && expr.callee.type === "Identifier" && (expr.callee.name === "tourAttrs" || expr.callee.name === "declareTour")) {
              return true;
            }
          }
          return false;
        });

      const isAriaHidden = (open) =>
        open.attributes.some((a) => attrName(a) === "aria-hidden" && a.value && a.value.type === "Literal" && a.value.value === true);

      const roleOf = (open) => {
        for (const a of open.attributes) {
          if (attrName(a) === "role" && a.value && a.value.type === "Literal" && typeof a.value.value === "string") {
            return a.value.value;
          }
        }
        return null;
      };

      return {
        JSXOpeningElement(node) {
          const tag = node.name && node.name.type === "JSXIdentifier" ? node.name.name : "";
          const isTag = INTERACTIVE_TAGS.has(tag);
          const isPrim = PRIMITIVE_ROOTS.has(tag);
          const role = roleOf(node);
          const isRole = role != null && INTERACTIVE_ROLES.has(role);
          if (!isTag && !isPrim && !isRole) return;
          if (isAriaHidden(node)) return;
          if (hasTourAttr(node)) return;
          // ancestor within 2 levels carrying data-tour-id / aria-hidden
          let p = node.parent;
          for (let i = 0; i < 2 && p; i++) {
            if (p.type === "JSXOpeningElement") {
              if (p.attributes.some((a) => attrName(a) === "data-tour-id" || attrName(a) === "aria-hidden")) return;
            }
            p = p.parent;
          }
          context.report({ node, messageId: "undeclared", data: { tag } });
        },
      };
    },
  },

  /** LAW 1 — tour content never lives in content files. */
  "no-content-files": {
    meta: { type: "problem", schema: [], messages: { file: "Hand-written tour content file — declarations belong inline on UI elements (LAW 1).", export: "Hand-written tour step array export — content must be generated from inline declarations (LAW 1)." } },
    create(context) {
      const file = rel(context);
      const badPath = file.includes("/tours/") || /tour-content|tour-steps/.test(file);
      return {
        "Program:exit"(node) {
          if (badPath) {
            context.report({ node, messageId: "file" });
            return;
          }
          if (/(?:const|let|var)\s+(?:TOUR_STEPS|TOUR_CONTENT|tourSteps|tourContent)\b/.test(srcText(context))) {
            context.report({ node, messageId: "export" });
          }
        },
      };
    },
  },
};

export default { rules: tourRules };
