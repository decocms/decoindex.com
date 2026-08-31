/**
 * Binary modules, resolved by the "Data" rule in wrangler.jsonc. tsc has no idea
 * these exist, so declare the shape wrangler actually hands the Worker.
 */
declare module "*.png" {
  const bytes: ArrayBuffer;
  export default bytes;
}
