import { isDangerousUrl } from "./dom"

export const bbcodeToHtml = (bbcode: string): string => {
  let html = bbcode

  html = html.replace(/\[h1\]([\s\S]*?)\[\/h1\]/gi, "<h1>$1</h1>")
  html = html.replace(/\[h2\]([\s\S]*?)\[\/h2\]/gi, "<h2>$1</h2>")
  html = html.replace(/\[h3\]([\s\S]*?)\[\/h3\]/gi, "<h3>$1</h3>")

  html = html.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, "<strong>$1</strong>")
  html = html.replace(/\[i\]([\s\S]*?)\[\/i\]/gi, "<em>$1</em>")
  html = html.replace(/\[u\]([\s\S]*?)\[\/u\]/gi, "<u>$1</u>")
  html = html.replace(/\[s\]([\s\S]*?)\[\/s\]/gi, "<s>$1</s>")

  html = html.replace(/\[url=["']?([^"'\]]+)["']?\]([\s\S]*?)\[\/url\]/gi, (_, href: string, text: string) =>
    isDangerousUrl(href) ? text : `<a href="${href}">${text}</a>`,
  )

  html = html.replace(/\[img\]([\s\S]*?)\[\/img\]/gi, '<img src="$1">')
  html = html.replace(
    /\[previewyoutube=["']?([^;'"]+)[^"'\]]*["']?\]\[\/previewyoutube\]/gi,
    '<img src="https://www.youtube.com/watch?v=$1">',
  )

  html = html.replace(/\[list\]([\s\S]*?)\[\/list\]/gi, (_, inner: string) => {
    const items = inner.replace(/\[\*\]([\s\S]*?)(?=\[\*\]|\[\/list\]|$)/gi, "<li>$1</li>")
    return `<ul>${items}</ul>`
  })
  html = html.replace(/\[olist\]([\s\S]*?)\[\/olist\]/gi, (_, inner: string) => {
    const items = inner.replace(/\[\*\]([\s\S]*?)(?=\[\*\]|\[\/olist\]|$)/gi, "<li>$1</li>")
    return `<ol>${items}</ol>`
  })

  html = html.replace(/\[quote(?:=[^\]]+)?\]([\s\S]*?)\[\/quote\]/gi, "<blockquote>$1</blockquote>")
  html = html.replace(/\[code\]([\s\S]*?)\[\/code\]/gi, "<pre><code>$1</code></pre>")
  html = html.replace(/\[spoiler\]([\s\S]*?)\[\/spoiler\]/gi, "<details><summary>Spoiler</summary>$1</details>")
  html = html.replace(/\[p\]([\s\S]*?)\[\/p\]/gi, (_, inner: string) => `<p>${inner.replace(/\n/g, "<br>")}</p>`)
  html = html.replace(/\n/g, "<br>")
  html = html.replace(/\[[^\]]+\]/g, "")

  return html
}
