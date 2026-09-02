import { Prisma, RepositoryScanStatus, ScanJobStatus } from "@prisma/client"
import { prisma } from "./client"

const STALE_SCAN_TIMEOUT_MS = 10 * 60 * 1000
const STALE_QUEUED_SCAN_ERROR_MESSAGE =
  "Scan was queued but never started sending progress updates. It was marked as failed so it can be retried."
const STALE_SCANNING_SCAN_ERROR_MESSAGE =
  "Scan stopped sending progress updates and was marked as failed. Retry the scan if it does not resume."

type ScanJobStalenessCandidate = {
  status: ScanJobStatus
  createdAt: Date
  startedAt: Date | null
  lastHeartbeatAt: Date | null
}

export function isScanJobStale(
  scanJob: ScanJobStalenessCandidate,
  now: Date = new Date()
): boolean {
  if (scanJob.status !== ScanJobStatus.QUEUED && scanJob.status !== ScanJobStatus.SCANNING) {
    return false
  }

  const lastActivityAt =
    scanJob.status === ScanJobStatus.QUEUED
      ? scanJob.createdAt
      : (scanJob.lastHeartbeatAt ?? scanJob.startedAt ?? scanJob.createdAt)

  return lastActivityAt.getTime() < now.getTime() - STALE_SCAN_TIMEOUT_MS
}

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
  repositoryId: string
): Promise<ScanJobSummary | null> {
  return prisma.scanJob.findFirst({
    where: {
      repositoryId,
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
  repositoryId: string,
  workspaceId: string
): Promise<{ scanJobId: string } | null> {
  return prisma.$transaction(async (tx) => {
    const repository = await tx.repository.findFirst({
      where: {
        id: repositoryId,
        workspaceId,
      },
      select: { activeScanJobId: true },
    })

    if (!repository?.activeScanJobId) {
      return null
    }

    const activeScanJob = await tx.scanJob.findFirst({
      where: {
        id: repository.activeScanJobId,
        repositoryId,
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        startedAt: true,
        lastHeartbeatAt: true,
      },
    })

    if (!activeScanJob || !isScanJobStale(activeScanJob)) {
      return null
    }

    const errorMessage =
      activeScanJob.status === ScanJobStatus.QUEUED
        ? STALE_QUEUED_SCAN_ERROR_MESSAGE
        : STALE_SCANNING_SCAN_ERROR_MESSAGE

    const failedScanJob = await tx.scanJob.updateMany({
      where: {
        id: activeScanJob.id,
        repositoryId,
        status: activeScanJob.status,
        updatedAt: activeScanJob.updatedAt,
      },
      data: {
        status: ScanJobStatus.FAILED,
        errorMessage,
        completedAt: new Date(),
      },
    })

    if (failedScanJob.count === 0) {
      return null
    }

    await tx.repository.updateMany({
      where: {
        id: repositoryId,
        workspaceId,
        activeScanJobId: activeScanJob.id,
      },
      data: {
        scanStatus: RepositoryScanStatus.FAILED,
        errorMessage,
        activeScanJobId: null,
      },
    })

    return { scanJobId: activeScanJob.id }
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
