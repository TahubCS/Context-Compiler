import { Prisma, RepositoryScanStatus, ScanJobStatus } from "@prisma/client"
import { prisma } from "./client"

const STALE_SCAN_TIMEOUT_MS = 3 * 60 * 1000

const SCAN_JOB_SELECT = {
  id: true,
  status: true,
  indexedCommitSha: true,
  filesDiscovered: true,
  filesProcessed: true,
  errorMessage: true,
  startedAt: true,
  lastHeartbeatAt: true,
  completedAt: true,
  createdAt: true,
} as const

export type ScanJobSummary = Prisma.ScanJobGetPayload<{
  select: typeof SCAN_JOB_SELECT
}>

const SCAN_JOB_WITH_REPOSITORY_SELECT = {
  ...SCAN_JOB_SELECT,
  repositoryId: true,
  repository: {
    select: {
      id: true,
      activeScanJobId: true,
    },
  },
} as const

export async function getLatestScanJobForRepository(
  repositoryId: string,
  userId: string
): Promise<ScanJobSummary | null> {
  return prisma.scanJob.findFirst({
    where: {
      repositoryId,
      repository: { userId },
    },
    select: SCAN_JOB_SELECT,
    orderBy: [{ createdAt: "desc" }],
  })
}

export async function createScanJob(
  repositoryId: string,
  triggeredByUserId: string
): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const repository = await tx.repository.findUnique({
      where: { id: repositoryId },
      select: { activeScanJobId: true },
    })

    if (!repository) {
      throw new Error("Repository not found.")
    }

    if (repository.activeScanJobId) {
      throw new Error("A scan is already queued or in progress for this repository.")
    }

    const scanJob = await tx.scanJob.create({
      data: {
        repositoryId,
        triggeredByUserId,
        status: ScanJobStatus.QUEUED,
        lastHeartbeatAt: null,
      },
      select: { id: true },
    })

    await tx.repository.update({
      where: { id: repositoryId },
      data: {
        scanStatus: RepositoryScanStatus.QUEUED,
        scanProgress: 0,
        filesDiscovered: 0,
        filesProcessed: 0,
        errorMessage: null,
        activeScanJobId: scanJob.id,
      },
    })

    return scanJob
  })
}

type ScanJobUpdateInput = {
  status: ScanJobStatus
  filesDiscovered?: number
  filesProcessed?: number
  errorMessage?: string | null
  indexedCommitSha?: string | null
  indexFormatVersion?: number
}

function mapScanJobStatusToRepositoryStatus(status: ScanJobStatus): RepositoryScanStatus {
  switch (status) {
    case ScanJobStatus.QUEUED:
      return RepositoryScanStatus.QUEUED
    case ScanJobStatus.SCANNING:
      return RepositoryScanStatus.SCANNING
    case ScanJobStatus.COMPLETED:
      return RepositoryScanStatus.COMPLETED
    case ScanJobStatus.FAILED:
      return RepositoryScanStatus.FAILED
  }
}

export async function updateScanJobStatus(
  scanJobId: string,
  repositoryId: string,
  data: ScanJobUpdateInput
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existingScanJob = await tx.scanJob.findUnique({
      where: { id: scanJobId },
      select: {
        repositoryId: true,
        startedAt: true,
        completedAt: true,
        indexedCommitSha: true,
      },
    })

    if (!existingScanJob || existingScanJob.repositoryId !== repositoryId) {
      throw new Error("Scan job not found for repository.")
    }

    const scanJob = await tx.scanJob.update({
      where: { id: scanJobId },
      data: {
        status: data.status,
        filesDiscovered: data.filesDiscovered,
        filesProcessed: data.filesProcessed,
        errorMessage: data.errorMessage,
        indexedCommitSha: data.indexedCommitSha,
        startedAt:
          data.status === ScanJobStatus.SCANNING
            ? (existingScanJob.startedAt ?? new Date())
            : undefined,
        lastHeartbeatAt: data.status === ScanJobStatus.SCANNING ? new Date() : undefined,
        completedAt:
          data.status === ScanJobStatus.COMPLETED || data.status === ScanJobStatus.FAILED
            ? (existingScanJob.completedAt ?? new Date())
            : undefined,
      },
      select: SCAN_JOB_WITH_REPOSITORY_SELECT,
    })

    if (scanJob.repository.activeScanJobId !== scanJob.id) {
      return
    }

    const repositoryUpdateData: Prisma.RepositoryUpdateInput = {
      scanStatus: mapScanJobStatusToRepositoryStatus(data.status),
      filesDiscovered: data.filesDiscovered,
      filesProcessed: data.filesProcessed,
      errorMessage: data.errorMessage,
      lastIndexedCommitSha:
        data.status === ScanJobStatus.COMPLETED
          ? (data.indexedCommitSha ?? existingScanJob.indexedCommitSha ?? scanJob.indexedCommitSha ?? null)
          : undefined,
      lastScannedAt: data.status === ScanJobStatus.COMPLETED ? new Date() : undefined,
      indexFormatVersion:
        data.status === ScanJobStatus.COMPLETED ? data.indexFormatVersion : undefined,
      activeScanJobId:
        data.status === ScanJobStatus.COMPLETED || data.status === ScanJobStatus.FAILED
          ? null
          : undefined,
    }

    await tx.repository.update({
      where: { id: scanJob.repositoryId },
      data: repositoryUpdateData,
    })
  })
}

export async function failStaleScanJobForRepository(
  repositoryId: string
): Promise<{ scanJobId: string } | null> {
  const staleBefore = new Date(Date.now() - STALE_SCAN_TIMEOUT_MS)

  return prisma.$transaction(async (tx) => {
    const staleScanJob = await tx.scanJob.findFirst({
      where: {
        repositoryId,
        status: ScanJobStatus.SCANNING,
        OR: [
          { lastHeartbeatAt: { lt: staleBefore } },
          { lastHeartbeatAt: null, startedAt: { lt: staleBefore } },
        ],
      },
      select: {
        id: true,
      },
      orderBy: [{ startedAt: "asc" }],
    })

    if (!staleScanJob) {
      return null
    }

    const repository = await tx.repository.findUnique({
      where: { id: repositoryId },
      select: { activeScanJobId: true },
    })

    await tx.scanJob.update({
      where: { id: staleScanJob.id },
      data: {
        status: ScanJobStatus.FAILED,
        errorMessage:
          "Scan stopped unexpectedly. The Python scanner may have restarted or crashed. Please retry.",
        completedAt: new Date(),
      },
    })

    if (repository?.activeScanJobId === staleScanJob.id) {
      await tx.repository.update({
        where: { id: repositoryId },
        data: {
          scanStatus: RepositoryScanStatus.FAILED,
          errorMessage:
            "Scan stopped unexpectedly. The Python scanner may have restarted or crashed. Please retry.",
          activeScanJobId: null,
        },
      })
    }

    return { scanJobId: staleScanJob.id }
  })
}

export async function failQueuedScanJob(
  scanJobId: string,
  repositoryId: string,
  errorMessage: string
): Promise<void> {
  await updateScanJobStatus(scanJobId, repositoryId, {
    status: ScanJobStatus.FAILED,
    errorMessage,
    filesDiscovered: 0,
    filesProcessed: 0,
  })
}
