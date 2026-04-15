import { transferContent } from "../utils/dom"

export const normaliseCallouts = (root: Element): void => {
  const doc = root.ownerDocument
  if (!doc) return

  for (const el of Array.from(root.querySelectorAll(".markdown-alert"))) {
    const typeClass = Array.from(el.classList).find((c) => c.startsWith("markdown-alert-") && c !== "markdown-alert")
    const type = typeClass?.replace("markdown-alert-", "") ?? "note"
    el.querySelector(".markdown-alert-title")?.remove()
    el.replaceWith(createCallout(doc, type, capitalize(type), el))
  }

  for (const el of Array.from(root.querySelectorAll('aside[class*="callout"]'))) {
    const typeClass = Array.from(el.classList).find((c) => c.startsWith("callout-"))
    const type = typeClass?.replace("callout-", "") ?? "note"
    const contentEl = el.querySelector(".callout-content")
    el.replaceWith(createCallout(doc, type, capitalize(type), contentEl ?? el))
  }

  for (const el of Array.from(root.querySelectorAll('.alert[class*="alert-"]'))) {
    const typeClass = Array.from(el.classList).find((c) => c.startsWith("alert-") && c !== "alert-dismissible")
    const type = typeClass?.replace("alert-", "") ?? "note"
    const titleEl = el.querySelector(".alert-heading, .alert-title")
    const title = titleEl?.textContent?.trim() ?? capitalize(type)
    titleEl?.remove()
    el.replaceWith(createCallout(doc, type, title, el))
  }
}

const createCallout = (doc: Document, type: string, title: string, source: Element): Element => {
  const callout = doc.createElement("div")
  callout.setAttribute("data-callout", type)
  callout.className = "callout"

  const titleDiv = doc.createElement("div")
  titleDiv.className = "callout-title"
  const titleInner = doc.createElement("div")
  titleInner.className = "callout-title-inner"
  titleInner.textContent = title
  titleDiv.appendChild(titleInner)
  callout.appendChild(titleDiv)

  const contentDiv = doc.createElement("div")
  contentDiv.className = "callout-content"
  transferContent(source, contentDiv)
  callout.appendChild(contentDiv)

  return callout
}

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
