// The workspace engine package is plain .mjs (no shipped types). Declare it so the app's TS compiles;
// the functions are exercised through the typed adapter in src/engine.ts.
declare module '@jobfaro/engine';
