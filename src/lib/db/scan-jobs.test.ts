import { describe, expect, test } from "bun:test"
import { ScanJobStatus } from "@prisma/client"
import { isScanJobStale } from "./scan-jobs"

const NOW = new Date("2026-09-02T12:00:00.000Z")

function minutesBeforeNow(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60 * 1000)
}

describe("scan job stale detection", () => {
  test("recovers a queued job that never started", () => {
    expect(
      isScanJobStale(
        {
          status: ScanJobStatus.QUEUED,
          createdAt: minutesBeforeNow(11),
          startedAt: null,
          lastHeartbeatAt: null,
        },
        NOW
      )
    ).toBe(true)
  })

  test("keeps a recently queued job locked", () => {
    expect(
      isScanJobStale(
        {
          status: ScanJobStatus.QUEUED,
          createdAt: minutesBeforeNow(9),
          startedAt: null,
          lastHeartbeatAt: null,
        },
        NOW
      )
    ).toBe(false)
  })

  test("uses the latest scanning heartbeat instead of the start time", () => {
    expect(
      isScanJobStale(
        {
          status: ScanJobStatus.SCANNING,
          createdAt: minutesBeforeNow(30),
          startedAt: minutesBeforeNow(29),
          lastHeartbeatAt: minutesBeforeNow(1),
        },
        NOW
      )
    ).toBe(false)
  })

  test("recovers a scanning job after its heartbeat expires", () => {
    expect(
      isScanJobStale(
        {
          status: ScanJobStatus.SCANNING,
          createdAt: minutesBeforeNow(30),
          startedAt: minutesBeforeNow(29),
          lastHeartbeatAt: minutesBeforeNow(11),
        },
        NOW
      )
    ).toBe(true)
  })

  test("falls back to scan start time when no heartbeat was recorded", () => {
    expect(
      isScanJobStale(
        {
          status: ScanJobStatus.SCANNING,
          createdAt: minutesBeforeNow(15),
          startedAt: minutesBeforeNow(11),
          lastHeartbeatAt: null,
        },
        NOW
      )
    ).toBe(true)
  })

  test("never treats terminal jobs as stale", () => {
    for (const status of [ScanJobStatus.COMPLETED, ScanJobStatus.FAILED]) {
      expect(
        isScanJobStale(
          {
            status,
            createdAt: minutesBeforeNow(60),
            startedAt: minutesBeforeNow(59),
            lastHeartbeatAt: minutesBeforeNow(58),
          },
          NOW
        )
      ).toBe(false)
    }
  })
})
