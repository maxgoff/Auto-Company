// Wrangler bundles *.ttf as binary `Data` modules (see `[[rules]]` in
// wrangler.toml), which arrive as an ArrayBuffer at runtime.
declare module '*.ttf' {
  const data: ArrayBuffer;
  export default data;
}
