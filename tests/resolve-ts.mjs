/**
 * Lets `node --test` load app modules the way Metro does: relative imports without an extension
 * resolve to the `.ts` file. Node strips the types itself, so no dependency is needed.
 * Native Expo modules that pure logic depends on are swapped for Node stand-ins in `tests/stubs/`,
 * and the repositories' database client for an in-memory `node:sqlite` one.
 */
import { registerHooks } from 'node:module';

const STUBS = {
  'expo-crypto': new URL('./stubs/expo-crypto.ts', import.meta.url).href,
};

/** Repositories open the app database through `../client`; tests get an in-memory SQLite instead. */
const DB_CLIENT_STUB = new URL('./stubs/dbClient.ts', import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (Object.hasOwn(STUBS, specifier)) {
      return nextResolve(STUBS[specifier], context);
    }
    if (specifier === '../client' && context.parentURL?.includes('/src/db/repositories/')) {
      return nextResolve(DB_CLIENT_STUB, context);
    }
    try {
      return nextResolve(specifier, context);
    } catch (e) {
      if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw e;
    }
  },
});
