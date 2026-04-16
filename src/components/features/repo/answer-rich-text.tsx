"use client"

import * as React from "react"

type AnswerRichTextProps = {
  text: string
}

export function AnswerRichText({ text }: AnswerRichTextProps) {
  const blocks = React.useMemo(() => tokenizeAnswer(text), [text])

  return (
    <div className="space-y-4 text-sm leading-7 text-foreground">
      {blocks.map((block, index) => {
        if (block.type === "list") {
          return (
            <ul key={`list-${index}`} className="space-y-2 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={`item-${itemIndex}`} className="list-disc marker:text-muted-foreground">
                  {renderInline(item)}
                </li>
              ))}
            </ul>
          )
        }

        return (
          <p key={`paragraph-${index}`} className="text-sm leading-7 text-foreground">
            {renderInline(block.content)}
          </p>
        )
      })}
    </div>
  )
}

function tokenizeAnswer(text: string) {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\. \* \*\*/g, ".\n\n* **")
    .replace(/: \* \*\*/g, ":\n\n* **")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  const rawBlocks = normalized.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean)

  return rawBlocks.map((block) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean)
    const listItems = lines
      .filter((line) => /^[-*]\s+/.test(line))
      .map((line) => line.replace(/^[-*]\s+/, "").trim())

    if (listItems.length === lines.length && listItems.length > 0) {
      return { type: "list" as const, items: listItems }
    }

    return { type: "paragraph" as const, content: block }
  })
}

function renderInline(text: string) {
  const nodes: React.ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }

    const token = match[0]
    if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(
        <strong key={`${match.index}-bold`} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>
      )
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <code
          key={`${match.index}-code`}
          className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground"
        >
          {token.slice(1, -1)}
        </code>
      )
    }

    lastIndex = match.index + token.length
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes
}
