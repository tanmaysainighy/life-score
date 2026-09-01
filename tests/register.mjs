import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

/**
 * Test-only module resolution.
 *
 * The app's source uses extensionless relative imports because that's what the
 * Next.js bundler expects. Node's ESM resolver requires an extension, so this
 * hook fills one in when running the tests directly. Nothing in src/ has to
 * bend around the test runner.
 */
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !path.extname(specifier)) {
      const base = context.parentURL
        ? path.dirname(fileURLToPath(context.parentURL))
        : process.cwd();

      for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
        const resolved = path.resolve(base, candidate);
        if (existsSync(resolved)) {
          return { url: pathToFileURL(resolved).href, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
});
