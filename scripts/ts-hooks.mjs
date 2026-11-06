// Lets `node --test` import src/server/*.ts directly: Node strips the types, and
// this adds the `.ts` the Bundler-style imports leave off. No build, no deps.
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (err) {
      if (/^\.\.?\//.test(specifier) && !/\.[a-z]+$/i.test(specifier)) return next(`${specifier}.ts`, context);
      throw err;
    }
  },
});
