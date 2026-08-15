// Node cannot parse JSX, so the render tests transform it on the way in.
// esbuild is already present (Vite builds with it), so this adds no download —
// it is declared explicitly in package.json rather than relied on transitively.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";

export async function load(url, context, nextLoad) {
  if (url.endsWith(".jsx")) {
    const source = await readFile(fileURLToPath(url), "utf8");
    const { code } = await transform(source, {
      loader: "jsx",
      format: "esm",
      target: "node20",
      // the automatic runtime, matching Vite — the components never import
      // React themselves, so the classic transform leaves React undefined
      jsx: "automatic",
      sourcefile: url,
    });
    return { format: "module", source: code, shortCircuit: true };
  }

  // stylesheets are a build concern; components under test do not need them
  if (url.endsWith(".css")) {
    return { format: "module", source: "export default {};", shortCircuit: true };
  }

  return nextLoad(url, context);
}
