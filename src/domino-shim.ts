import { parseHTML } from "linkedom"

export const createDocument = (html: string) => parseHTML(html).document
