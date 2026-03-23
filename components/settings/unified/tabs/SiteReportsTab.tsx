'use client'

import { useState } from 'react'
import { Button, toast, Spinner } from '@ciphera-net/ui'
import { Plus, Pencil, Trash, EnvelopeSimple, WebhooksLogo, PaperPlaneTilt } from '@phosphor-icons/react'
import { useReportSchedules, useAlertSchedules } from '@/lib/swr/dashboard'
import { deleteReportSchedule, testReportSchedule, updateReportSchedule, type ReportSchedule } from '@/lib/api/report-schedules'
import { getAuthErrorMessage } from '@ciphera-net/ui'

function ChannelIcon({ channel }: { channel: string }) {
  switch (channel) {
    case 'email': return <EnvelopeSimple weight="bold" className="w-4 h-4" />
    case 'webhook': return <WebhooksLogo weight="bold" className="w-4 h-4" />
    default: return <PaperPlaneTilt weight="bold" className="w-4 h-4" />
  }
}

function ScheduleRow({ schedule, siteId, onMutate }: { schedule: ReportSchedule; siteId: string; onMutate: () => void }) {
  const [testing, setTesting] = useState(false)

  const handleTest = async () => {
    setTesting(true)
    try {
      await testReportSchedule(siteId, schedule.id)
      toast.success('Test report sent')
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to send test')
    } finally {
      setTesting(false)
    }
  }

  const handleToggle = async () => {
    try {
      await updateReportSchedule(siteId, schedule.id, {
        channel: schedule.channel,
        channel_config: schedule.channel_config,
        frequency: schedule.frequency,
        report_type: schedule.report_type,
        enabled: !schedule.enabled,
        send_hour: schedule.send_hour,
        send_day: schedule.send_day ?? undefined,
        timezone: schedule.timezone,
        purpose: schedule.purpose,
      })
      toast.success(schedule.enabled ? 'Report paused' : 'Report enabled')
      onMutate()
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to update')
    }
  }

  const handleDelete = async () => {
    try {
      await deleteReportSchedule(siteId, schedule.id)
      toast.success('Report deleted')
      onMutate()
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to delete')
    }
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 rounded-xl hover:bg-neutral-800/40 transition-colors group">
      <div className="flex items-center gap-3">
        <div className={`p-1.5 rounded-lg ${schedule.enabled ? 'bg-brand-orange/10 text-brand-orange' : 'bg-neutral-800 text-neutral-500'}`}>
          <ChannelIcon channel={schedule.channel} />
        </div>
        <div>
          <p className="text-sm font-medium text-white">
            {schedule.channel === 'email' && 'recipients' in schedule.channel_config
              ? (schedule.channel_config as { recipients: string[] }).recipients?.[0]
              : schedule.channel}
            {!schedule.enabled && <span className="ml-2 text-xs text-neutral-500">(paused)</span>}
          </p>
          <p className="text-xs text-neutral-500">
            {schedule.frequency} · {schedule.report_type} report
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={handleTest} disabled={testing} className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors">
          <PaperPlaneTilt weight="bold" className="w-3.5 h-3.5" />
        </button>
        <button onClick={handleToggle} className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors">
          {schedule.enabled ? 'Pause' : 'Enable'}
        </button>
        <button onClick={handleDelete} className="p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-900/20 transition-colors">
          <Trash weight="bold" className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

export default function SiteReportsTab({ siteId }: { siteId: string }) {
  const { data: reports = [], isLoading: reportsLoading, mutate: mutateReports } = useReportSchedules(siteId)
  const { data: alerts = [], isLoading: alertsLoading, mutate: mutateAlerts } = useAlertSchedules(siteId)

  const loading = reportsLoading || alertsLoading

  if (loading) return <div className="flex items-center justify-center py-12"><Spinner className="w-6 h-6 text-neutral-500" /></div>

  return (
    <div className="space-y-8">
      {/* Scheduled Reports */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-white mb-1">Scheduled Reports</h3>
            <p className="text-sm text-neutral-400">Automated analytics summaries via email or webhook.</p>
          </div>
          <a href={`/sites/${siteId}/settings?tab=notifications`}>
            <Button variant="primary" className="text-sm gap-1.5">
              <Plus weight="bold" className="w-3.5 h-3.5" /> Add Report
            </Button>
          </a>
        </div>

        {reports.length === 0 ? (
          <p className="text-sm text-neutral-500 text-center py-6">No scheduled reports yet.</p>
        ) : (
          <div className="space-y-1">
            {reports.map(r => (
              <ScheduleRow key={r.id} schedule={r} siteId={siteId} onMutate={() => mutateReports()} />
            ))}
          </div>
        )}
      </div>

      {/* Alert Channels */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-white mb-1">Alert Channels</h3>
            <p className="text-sm text-neutral-400">Get notified when uptime monitors go down.</p>
          </div>
          <a href={`/sites/${siteId}/settings?tab=notifications`}>
            <Button variant="secondary" className="text-sm gap-1.5">
              <Plus weight="bold" className="w-3.5 h-3.5" /> Add Channel
            </Button>
          </a>
        </div>

        {alerts.length === 0 ? (
          <p className="text-sm text-neutral-500 text-center py-6">No alert channels configured.</p>
        ) : (
          <div className="space-y-1">
            {alerts.map(a => (
              <ScheduleRow key={a.id} schedule={a} siteId={siteId} onMutate={() => mutateAlerts()} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
