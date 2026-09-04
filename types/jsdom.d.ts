// * jsdom ships no types and @types/jsdom is not a dependency. The tracker contract test
// * constructs one window per case through the constructor only.
declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string, options?: Record<string, unknown>)
    window: any
  }
}
