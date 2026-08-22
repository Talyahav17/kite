/**
 * P-053: the bug class that produced T-010, P-051 and P-052.
 *
 * All three were the same shape — a promise that rejected into nothing. The
 * page kept its skeletons up for ever, or the revoke modal sat there saying
 * nothing, or the trip claimed not to exist. Each was found by accident: an
 * error log, a /healthz delta, and reading nearby code. This makes the fourth
 * one a lint failure instead of a discovery.
 *
 * Two shapes are reported:
 *   1. an async function whose `await` is not inside a try/catch
 *   2. a `.then()` chain with no `.catch()` anywhere in it
 *
 * Both are about UI code, where nothing above the handler will catch for it —
 * a click handler that throws reaches no one but the error log.
 */
const MESSAGES = {
  unguardedAwait:
    "This await can reject and nothing catches it — the user sees no change at all. Wrap it in try/catch (see TripDetail.jsx `failed`).",
  thenWithoutCatch:
    "This .then() has no .catch() — a rejection here is silent. T-010 was exactly this.",
};

/** The function a node sits directly inside, or null at module top level. */
function enclosingFunction(ancestors) {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const { type } = ancestors[i];
    if (
      type === "FunctionDeclaration" ||
      type === "FunctionExpression" ||
      type === "ArrowFunctionExpression"
    )
      return ancestors[i];
  }
  return null;
}

/**
 * True when the node sits in the *guarded* part of a try — the block itself.
 * A throw inside the catch or finally is not protected by that same try.
 */
function insideTryBlock(ancestors, stopAt) {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const node = ancestors[i];
    if (node === stopAt) return false;
    if (node.type === "TryStatement") {
      const child = ancestors[i + 1];
      if (child && child === node.block) return true;
    }
  }
  return false;
}

export default {
  meta: {
    type: "problem",
    docs: { description: "Require rejection handling on promises in UI code" },
    schema: [],
    messages: MESSAGES,
  },

  create(context) {
    const reported = new Set();

    return {
      AwaitExpression(node) {
        const ancestors = context.sourceCode.getAncestors(node);
        const fn = enclosingFunction(ancestors);
        if (!fn || reported.has(fn)) return;
        if (insideTryBlock(ancestors, fn)) return;

        // An async function that is awaited by its caller is that caller's
        // problem to handle, so only flag the ones nothing is waiting on.
        if (fn.parent?.type === "AwaitExpression") return;

        reported.add(fn);
        context.report({ node: node, messageId: "unguardedAwait" });
      },

      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression" || callee.property.name !== "then")
          return;

        // Walk out through the rest of the chain looking for a .catch().
        let current = node;
        while (current.parent) {
          const parent = current.parent;
          if (parent.type === "MemberExpression" && parent.object === current) {
            const name = parent.property.name;
            if (name === "catch") return;
            current = parent;
            continue;
          }
          if (parent.type === "CallExpression" && parent.callee === current) {
            current = parent;
            continue;
          }
          break;
        }

        // A second argument to .then() is an onRejected handler.
        if (node.arguments.length > 1) return;

        context.report({ node: callee.property, messageId: "thenWithoutCatch" });
      },
    };
  },
};
