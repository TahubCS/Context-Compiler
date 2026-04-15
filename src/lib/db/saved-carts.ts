import { Prisma } from "@prisma/client"
import { prisma } from "./client"

const SAVED_CART_LIST_SELECT = {
  id: true,
  title: true,
  description: true,
  updatedAt: true,
  createdAt: true,
  _count: {
    select: {
      items: true,
    },
  },
} as const

const SAVED_CART_ITEM_SELECT = {
  id: true,
  codeDocumentId: true,
  filePath: true,
  chunkIndex: true,
  language: true,
  contentSnapshot: true,
  score: true,
  orderIndex: true,
  createdAt: true,
} as const

const SAVED_CART_DETAIL_SELECT = {
  id: true,
  title: true,
  description: true,
  updatedAt: true,
  createdAt: true,
  repository: {
    select: {
      id: true,
      fullName: true,
    },
  },
  items: {
    select: SAVED_CART_ITEM_SELECT,
    orderBy: {
      orderIndex: "asc",
    },
  },
} as const

export type SavedCartListItem = Prisma.SavedCartGetPayload<{
  select: typeof SAVED_CART_LIST_SELECT
}>

export type SavedCartDetail = Prisma.SavedCartGetPayload<{
  select: typeof SAVED_CART_DETAIL_SELECT
}>

export type SavedCartInputItem = {
  codeDocumentId?: string | null
  filePath: string
  chunkIndex: number
  language?: string | null
  contentSnapshot: string
  score?: number | null
}

export async function listSavedCarts(
  repositoryId: string,
  workspaceId: string
): Promise<SavedCartListItem[]> {
  return prisma.savedCart.findMany({
    where: { repositoryId, workspaceId },
    select: SAVED_CART_LIST_SELECT,
    orderBy: [{ updatedAt: "desc" }],
  })
}

export async function getSavedCart(
  cartId: string,
  repositoryId: string,
  workspaceId: string
): Promise<SavedCartDetail | null> {
  return prisma.savedCart.findFirst({
    where: { id: cartId, repositoryId, workspaceId },
    select: SAVED_CART_DETAIL_SELECT,
  })
}

export async function createSavedCart(
  repositoryId: string,
  userId: string,
  workspaceId: string,
  input: {
    title: string
    description?: string | null
    items: SavedCartInputItem[]
  }
): Promise<SavedCartDetail> {
  return prisma.savedCart.create({
    data: {
      repositoryId,
      userId,
      workspaceId,
      title: input.title,
      description: input.description ?? null,
      items: {
        create: input.items.map((item, index) => ({
          codeDocumentId: item.codeDocumentId ?? null,
          filePath: item.filePath,
          chunkIndex: item.chunkIndex,
          language: item.language ?? null,
          contentSnapshot: item.contentSnapshot,
          score: item.score ?? null,
          orderIndex: index,
        })),
      },
    },
    select: SAVED_CART_DETAIL_SELECT,
  })
}

export async function updateSavedCart(
  cartId: string,
  repositoryId: string,
  workspaceId: string,
  input: {
    title: string
    description?: string | null
    items: SavedCartInputItem[]
  }
): Promise<SavedCartDetail | null> {
  const existing = await prisma.savedCart.findFirst({
    where: { id: cartId, repositoryId, workspaceId },
    select: { id: true },
  })

  if (!existing) {
    return null
  }

  return prisma.$transaction(async (tx) => {
    await tx.savedCartItem.deleteMany({
      where: {
        savedCartId: cartId,
      },
    })

    return tx.savedCart.update({
      where: { id: cartId },
      data: {
        title: input.title,
        description: input.description ?? null,
        items: {
          create: input.items.map((item, index) => ({
            codeDocumentId: item.codeDocumentId ?? null,
            filePath: item.filePath,
            chunkIndex: item.chunkIndex,
            language: item.language ?? null,
            contentSnapshot: item.contentSnapshot,
            score: item.score ?? null,
            orderIndex: index,
          })),
        },
      },
      select: SAVED_CART_DETAIL_SELECT,
    })
  })
}

export async function deleteSavedCart(
  cartId: string,
  repositoryId: string,
  workspaceId: string
): Promise<boolean> {
  const result = await prisma.savedCart.deleteMany({
    where: { id: cartId, repositoryId, workspaceId },
  })

  return result.count > 0
}
