/**
 * Minimal inline type declarations for `turndown` — only the subset we use.
 * Replaces `@types/turndown` as a devDependency.
 */
declare module "turndown" {
  type TagName = keyof HTMLElementTagNameMap
  type Node = HTMLElement | Document | DocumentFragment
  type Filter = TagName | TagName[] | ((node: HTMLElement, options: Options) => boolean)
  type ReplacementFunction = (content: string, node: Node, options: Options) => string

  interface Options {
    headingStyle?: "setext" | "atx"
    hr?: string
    br?: string
    bulletListMarker?: "-" | "+" | "*"
    codeBlockStyle?: "indented" | "fenced"
    emDelimiter?: "_" | "*"
    fence?: "```" | "~~~"
    strongDelimiter?: "__" | "**"
    linkStyle?: "inlined" | "referenced"
    linkReferenceStyle?: "full" | "collapsed" | "shortcut"
    preformattedCode?: boolean
    keepReplacement?: ReplacementFunction
    blankReplacement?: ReplacementFunction
    defaultReplacement?: ReplacementFunction
  }

  interface Rule {
    filter: Filter
    replacement?: ReplacementFunction
  }

  class TurndownService {
    constructor(options?: Options)
    addRule(key: string, rule: Rule): this
    keep(filter: Filter): this
    remove(filter: Filter): this
    use(plugins: ((service: TurndownService) => void) | Array<(service: TurndownService) => void>): this
    escape(str: string): string
    turndown(html: string | Node): string
    options: Options
  }

  export = TurndownService
}
