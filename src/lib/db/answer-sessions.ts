import { Prisma } from "@prisma/client"
import { prisma } from "./client"

const ANSWER_CITATION_SELECT = {
  id: true,
  codeDocumentId: true,
  filePath: true,
  chunkIndex: true,
  language: true,
  contentSnapshot: true,
  score: true,
  orderIndex: true,
} as const

const ANSWER_SESSION_LIST_SELECT = {
  id: true,
  question: true,
  status: true,
  updatedAt: true,
  createdAt: true,
  _count: {
    select: {
      citations: true,
    },
  },
} as const

const ANSWER_SESSION_DETAIL_SELECT = {
  id: true,
  question: true,
  answer: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  repository: {
    select: {
      id: true,
      fullName: true,
    },
  },
  citations: {
    select: ANSWER_CITATION_SELECT,
    orderBy: {
      orderIndex: "asc",
    },
  },
} as const

export type AnswerSessionListItem = Prisma.AnswerSessionGetPayload<{
  select: typeof ANSWER_SESSION_LIST_SELECT
}>

export type AnswerSessionDetail = Prisma.AnswerSessionGetPayload<{
  select: typeof ANSWER_SESSION_DETAIL_SELECT
}>

export type AnswerCitationInput = {
  codeDocumentId?: string | null
  filePath: string
  chunkIndex: number
  language?: string | null
  contentSnapshot: string
  score?: number | null
}

export async function listAnswerSessions(
  repositoryId: string,
  userId: string
): Promise<AnswerSessionListItem[]> {
  return prisma.answerSession.findMany({
    where: {
      repositoryId,
      userId,
      status: "SAVED",
    },
    select: ANSWER_SESSION_LIST_SELECT,
    orderBy: [{ updatedAt: "desc" }],
  })
}

export async function getAnswerSession(
  answerSessionId: string,
  repositoryId: string,
  userId: string
): Promise<AnswerSessionDetail | null> {
  return prisma.answerSession.findFirst({
    where: {
      id: answerSessionId,
      repositoryId,
      userId,
    },
    select: ANSWER_SESSION_DETAIL_SELECT,
  })
}

export async function createAnswerSession(
  repositoryId: string,
  userId: string,
  input: {
    question: string
    answer: string
    citations: AnswerCitationInput[]
  }
): Promise<AnswerSessionDetail> {
  return prisma.answerSession.create({
    data: {
      repositoryId,
      userId,
      question: input.question,
      answer: input.answer,
      status: "SAVED",
      citations: {
        create: input.citations.map((citation, index) => ({
          codeDocumentId: citation.codeDocumentId ?? null,
          filePath: citation.filePath,
          chunkIndex: citation.chunkIndex,
          language: citation.language ?? null,
          contentSnapshot: citation.contentSnapshot,
          score: citation.score ?? null,
          orderIndex: index,
        })),
      },
    },
    select: ANSWER_SESSION_DETAIL_SELECT,
  })
}

export async function deleteAnswerSession(
  answerSessionId: string,
  repositoryId: string,
  userId: string
): Promise<boolean> {
  const result = await prisma.answerSession.deleteMany({
    where: {
      id: answerSessionId,
      repositoryId,
      userId,
    },
  })

  return result.count > 0
}
