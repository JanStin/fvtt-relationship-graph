// cytoscape-fcose ships no type declarations, and there's no @types package for it.
declare module "cytoscape-fcose" {
  const ext: import("cytoscape").Ext;
  export default ext;
}
