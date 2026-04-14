export type PromptPackSnippet = {
  filePath: string
  chunkIndex: number
  language: string | null
  content: string
}

export function formatContextPack(
  repositoryName: string,
  snippets: PromptPackSnippet[],
  title?: string
): string {
  const heading = title ? `${title} - Context Pack` : "Context Pack"
  const sections = snippets.map((snippet) => {
    const language = snippet.language ?? ""
    return [
      `--- FILE: ${snippet.filePath} (chunk ${snippet.chunkIndex}) ---`,
      `\`\`\`${language}`,
      snippet.content,
      "```",
    ].join("\n")
  })

  return [`# ${heading}`, `Repository: ${repositoryName}`, "", ...sections].join("\n")
}

export function formatAnswerPack(
  repositoryName: string,
  question: string,
  answer: string,
  citations: PromptPackSnippet[]
): string {
  const citationSections = citations.map((citation) => {
    const language = citation.language ?? ""
    return [
      `--- FILE: ${citation.filePath} (chunk ${citation.chunkIndex}) ---`,
      `\`\`\`${language}`,
      citation.content,
      "```",
    ].join("\n")
  })

  return [
    "# Answer Pack",
    `Repository: ${repositoryName}`,
    "",
    "## Question",
    question,
    "",
    "## Answer",
    answer,
    "",
    "## Supporting Context",
    ...citationSections,
  ].join("\n")
}
