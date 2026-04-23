'use client'

import { useState } from 'react'
import { Button, toast, Spinner, Modal, Select } from '@ciphera-net/ui'
import { Plus, Pencil, Trash, EnvelopeSimple, WebhooksLogo, PaperPlaneTilt, FileText, Bell } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import { SiDiscord } from '@icons-pack/react-simple-icons'
import { useReportSchedules, useAlertSchedules } from '@/lib/swr/dashboard'
import { useSite } from '@/lib/swr/dashboard'
import {
  createReportSchedule,
  updateReportSchedule,
  deleteReportSchedule,
  testReportSchedule,
  type ReportSchedule,
  type CreateReportScheduleRequest,
  type EmailConfig,
  type WebhookConfig,
} from '@/lib/api/report-schedules'
import { getAuthErrorMessage } from '@ciphera-net/ui'
import { formatDateTime } from '@/lib/utils/formatDate'

// ── Helpers ──────────────────────────────────────────────────────────────────

const TIMEZONES = [
  'UTC', 'America/New_York', 'America/Los_Angeles', 'America/Chicago',
  'America/Toronto', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Europe/Amsterdam', 'Asia/Tokyo', 'Asia/Singapore', 'Asia/Dubai',
  'Australia/Sydney', 'Pacific/Auckland',
]

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const formatHour = (hour: number) => {
  if (hour === 0) return '12:00 AM'
  if (hour === 12) return '12:00 PM'
  return hour < 12 ? `${hour}:00 AM` : `${hour - 12}:00 PM`
}

const ordinalSuffix = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// ── Icons ────────────────────────────────────────────────────────────────────

function SlackIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ fill: 'none' }}>
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" style={{ fill: '#E01E5A' }}/>
      <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" style={{ fill: '#36C5F0' }}/>
      <path d="M18.958 8.834a2.528 2.528 0 0 1 2.52-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.52V8.834zm-1.271 0a2.528 2.528 0 0 1-2.521 2.521 2.528 2.528 0 0 1-2.521-2.521V2.522A2.528 2.528 0 0 1 15.166 0a2.528 2.528 0 0 1 2.521 2.522v6.312z" style={{ fill: '#2EB67D' }}/>
      <path d="M15.166 18.958a2.528 2.528 0 0 1 2.521 2.52A2.528 2.528 0 0 1 15.166 24a2.528 2.528 0 0 1-2.521-2.522v-2.52h2.521zm0-1.271a2.528 2.528 0 0 1-2.521-2.521 2.528 2.528 0 0 1 2.521-2.521h6.312A2.528 2.528 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.521h-6.312z" style={{ fill: '#ECB22E' }}/>
    </svg>
  )
}

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  email: <EnvelopeSimple weight="bold" className="w-4 h-4" />,
  slack: <SlackIcon size={16} />,
  discord: <SiDiscord size={16} color="#5865F2" />,
  webhook: <WebhooksLogo weight="bold" className="w-4 h-4" />,
}

function ChannelIcon({ channel }: { channel: string }) {
  return <>{CHANNEL_ICONS[channel] ?? <PaperPlaneTilt weight="bold" className="w-4 h-4" />}</>
}

// ── Schedule Row ─────────────────────────────────────────────────────────────

function ScheduleRow({
  schedule,
  siteId,
  onMutate,
  onEdit,
}: {
  schedule: ReportSchedule
  siteId: string
  onMutate: () => void
  onEdit: (schedule: ReportSchedule) => void
}) {
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
    <div className="flex items-center justify-between px-4 py-3 rounded-xl hover:bg-neutral-800/40 transition-colors group ease-apple">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`p-1.5 rounded-lg flex-shrink-0 ${schedule.enabled ? 'bg-brand-orange/10 text-brand-orange' : 'bg-neutral-800 text-neutral-500'}`}>
          <ChannelIcon channel={schedule.channel} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-white truncate">
            {schedule.channel === 'email' && 'recipients' in schedule.channel_config
              ? (schedule.channel_config as EmailConfig).recipients?.[0]
              : schedule.channel}
            {!schedule.enabled && <span className="ml-2 text-xs text-neutral-500">(paused)</span>}
          </p>
          <p className="text-xs text-neutral-500">
            {schedule.frequency} · {schedule.report_type} report
            {schedule.last_sent_at && (
              <span className="ml-1">· sent {formatDateTime(new Date(schedule.last_sent_at))}</span>
            )}
          </p>
          {schedule.last_error && (
            <p className="text-xs text-red-400 truncate mt-0.5">{schedule.last_error}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={() => onEdit(schedule)} className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors ease-apple" title="Edit">
          <Pencil weight="bold" className="w-3.5 h-3.5" />
        </button>
        <button onClick={handleTest} disabled={testing} className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors ease-apple" title="Send test">
          <PaperPlaneTilt weight="bold" className="w-3.5 h-3.5" />
        </button>
        <button onClick={handleToggle} className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors ease-apple">
          {schedule.enabled ? 'Pause' : 'Enable'}
        </button>
        <button onClick={handleDelete} className="p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-900/20 transition-colors ease-apple" title="Delete">
          <Trash weight="bold" className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── Channel Grid Picker ──────────────────────────────────────────────────────

const CHANNELS = ['email', 'slack', 'discord', 'webhook'] as const

function ChannelPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {CHANNELS.map((ch) => (
        <button
          key={ch}
          type="button"
          onClick={() => onChange(ch)}
          className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-colors ${
            value === ch
              ? 'border-brand-orange bg-brand-orange/10 text-white'
              : 'border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-white'
          } ease-apple`}
        >
          {CHANNEL_ICONS[ch]}
          <span className="text-xs capitalize">{ch}</span>
        </button>
      ))}
    </div>
  )
}

// ── Shared form label ────────────────────────────────────────────────────────

function FormLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="block text-sm font-medium text-neutral-300 mb-1.5">{children}</label>
}

function FormInput({ id, type = 'text', value, onChange, placeholder }: { id?: string; type?: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-10 px-4 bg-transparent border border-neutral-800 rounded-lg text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-brand-orange focus:ring-4 focus:ring-brand-orange/10 transition-colors ease-apple"
    />
  )
}

// ── Report Schedule Modal ────────────────────────────────────────────────────

function ReportScheduleModal({
  isOpen,
  onClose,
  siteId,
  siteTimezone,
  editing,
  onSaved,
}: {
  isOpen: boolean
  onClose: () => void
  siteId: string
  siteTimezone: string
  editing: ReportSchedule | null
  onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(() => formFromSchedule(editing, siteTimezone))

  // Reset form when editing target changes
  function formFromSchedule(schedule: ReportSchedule | null, fallbackTz: string) {
    if (schedule) {
      return {
        channel: schedule.channel,
        recipients: schedule.channel === 'email' && 'recipients' in schedule.channel_config
          ? (schedule.channel_config as EmailConfig).recipients.join(', ')
          : '',
        webhookUrl: schedule.channel !== 'email' && 'url' in schedule.channel_config
          ? (schedule.channel_config as WebhookConfig).url
          : '',
        frequency: schedule.frequency,
        reportType: schedule.report_type,
        timezone: schedule.timezone || fallbackTz,
        sendHour: schedule.send_hour,
        sendDay: schedule.send_day ?? 1,
      }
    }
    return {
      channel: 'email',
      recipients: '',
      webhookUrl: '',
      frequency: 'weekly',
      reportType: 'summary',
      timezone: fallbackTz,
      sendHour: 9,
      sendDay: 1,
    }
  }

  // Re-init when modal opens with different editing target
  const [prevEditing, setPrevEditing] = useState<ReportSchedule | null>(editing)
  if (editing !== prevEditing) {
    setPrevEditing(editing)
    setForm(formFromSchedule(editing, siteTimezone))
  }

  const updateField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const handleSubmit = async () => {
    // Validation
    if (form.channel === 'email') {
      const emails = form.recipients.split(',').map((r) => r.trim()).filter(Boolean)
      if (emails.length === 0) { toast.error('Enter at least one email address'); return }
    } else {
      if (!form.webhookUrl.trim()) { toast.error('Enter a webhook URL'); return }
    }

    setSaving(true)
    try {
      const channelConfig: EmailConfig | WebhookConfig =
        form.channel === 'email'
          ? { recipients: form.recipients.split(',').map((r) => r.trim()).filter(Boolean) }
          : { url: form.webhookUrl.trim() }

      const payload: CreateReportScheduleRequest = {
        channel: form.channel,
        channel_config: channelConfig,
        frequency: form.frequency,
        report_type: form.reportType,
        timezone: form.timezone,
        send_hour: form.sendHour,
        send_day: form.frequency === 'weekly' || form.frequency === 'monthly' ? form.sendDay : undefined,
        purpose: 'report',
      }

      if (editing) {
        await updateReportSchedule(siteId, editing.id, payload)
        toast.success('Report schedule updated')
      } else {
        await createReportSchedule(siteId, payload)
        toast.success('Report schedule created')
      }
      onSaved()
      onClose()
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to save schedule')
    } finally {
      setSaving(false)
    }
  }

  const webhookPlaceholder =
    form.channel === 'slack' ? 'https://hooks.slack.com/services/...'
    : form.channel === 'discord' ? 'https://discord.com/api/webhooks/...'
    : 'https://example.com/webhook'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editing ? 'Edit Report Schedule' : 'New Report Schedule'}>
      <div className="space-y-5">
        {/* Channel */}
        <div>
          <FormLabel>Channel</FormLabel>
          <ChannelPicker value={form.channel} onChange={(v) => updateField('channel', v)} />
        </div>

        {/* Recipients / URL */}
        {form.channel === 'email' ? (
          <div>
            <FormLabel htmlFor="report-recipients">Recipients</FormLabel>
            <FormInput
              id="report-recipients"
              value={form.recipients}
              onChange={(v) => updateField('recipients', v)}
              placeholder="email@example.com, another@example.com"
            />
            <p className="text-xs text-neutral-500 mt-1">Comma-separated email addresses</p>
          </div>
        ) : (
          <div>
            <FormLabel htmlFor="report-webhook">Webhook URL</FormLabel>
            <FormInput
              id="report-webhook"
              type="url"
              value={form.webhookUrl}
              onChange={(v) => updateField('webhookUrl', v)}
              placeholder={webhookPlaceholder}
            />
          </div>
        )}

        {/* Frequency */}
        <div>
          <FormLabel>Frequency</FormLabel>
          <Select
            value={form.frequency}
            onChange={(v) => updateField('frequency', v)}
            variant="input"
            fullWidth
            options={[
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
            ]}
          />
        </div>

        {/* Day of week (weekly) */}
        {form.frequency === 'weekly' && (
          <div>
            <FormLabel>Day of Week</FormLabel>
            <Select
              value={String(form.sendDay)}
              onChange={(v) => updateField('sendDay', Number(v))}
              variant="input"
              fullWidth
              options={WEEKDAY_NAMES.map((name, i) => ({ value: String(i + 1), label: name }))}
            />
          </div>
        )}

        {/* Day of month (monthly) */}
        {form.frequency === 'monthly' && (
          <div>
            <FormLabel>Day of Month</FormLabel>
            <Select
              value={String(form.sendDay)}
              onChange={(v) => updateField('sendDay', Number(v))}
              variant="input"
              fullWidth
              options={Array.from({ length: 28 }, (_, i) => ({
                value: String(i + 1),
                label: ordinalSuffix(i + 1),
              }))}
            />
          </div>
        )}

        {/* Time */}
        <div>
          <FormLabel>Time</FormLabel>
          <Select
            value={String(form.sendHour)}
            onChange={(v) => updateField('sendHour', Number(v))}
            variant="input"
            fullWidth
            options={Array.from({ length: 24 }, (_, i) => ({
              value: String(i),
              label: formatHour(i),
            }))}
          />
        </div>

        {/* Timezone */}
        <div>
          <FormLabel>Timezone</FormLabel>
          <Select
            value={form.timezone}
            onChange={(v) => updateField('timezone', v)}
            variant="input"
            fullWidth
            options={TIMEZONES.map((tz) => ({ value: tz, label: tz.replace(/_/g, ' ') }))}
          />
        </div>

        {/* Report Type */}
        <div>
          <FormLabel>Report Type</FormLabel>
          <Select
            value={form.reportType}
            onChange={(v) => updateField('reportType', v)}
            variant="input"
            fullWidth
            options={[
              { value: 'summary', label: 'Summary' },
              { value: 'pages', label: 'Pages' },
              { value: 'sources', label: 'Sources' },
              { value: 'goals', label: 'Goals' },
            ]}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? <Spinner className="w-4 h-4" /> : editing ? 'Save Changes' : 'Create Schedule'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Alert Channel Modal ──────────────────────────────────────────────────────

function AlertChannelModal({
  isOpen,
  onClose,
  siteId,
  siteTimezone,
  editing,
  onSaved,
}: {
  isOpen: boolean
  onClose: () => void
  siteId: string
  siteTimezone: string
  editing: ReportSchedule | null
  onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(() => formFromAlert(editing))

  function formFromAlert(schedule: ReportSchedule | null) {
    if (schedule) {
      return {
        channel: schedule.channel,
        recipients: schedule.channel === 'email' && 'recipients' in schedule.channel_config
          ? (schedule.channel_config as EmailConfig).recipients.join(', ')
          : '',
        webhookUrl: schedule.channel !== 'email' && 'url' in schedule.channel_config
          ? (schedule.channel_config as WebhookConfig).url
          : '',
      }
    }
    return { channel: 'email', recipients: '', webhookUrl: '' }
  }

  const [prevEditing, setPrevEditing] = useState<ReportSchedule | null>(editing)
  if (editing !== prevEditing) {
    setPrevEditing(editing)
    setForm(formFromAlert(editing))
  }

  const updateField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const handleSubmit = async () => {
    if (form.channel === 'email') {
      const emails = form.recipients.split(',').map((r) => r.trim()).filter(Boolean)
      if (emails.length === 0) { toast.error('Enter at least one email address'); return }
    } else {
      if (!form.webhookUrl.trim()) { toast.error('Enter a webhook URL'); return }
    }

    setSaving(true)
    try {
      const channelConfig: EmailConfig | WebhookConfig =
        form.channel === 'email'
          ? { recipients: form.recipients.split(',').map((r) => r.trim()).filter(Boolean) }
          : { url: form.webhookUrl.trim() }

      const payload: CreateReportScheduleRequest = {
        channel: form.channel,
        channel_config: channelConfig,
        frequency: 'daily', // Alerts don't have a user-chosen frequency
        timezone: siteTimezone,
        purpose: 'alert',
      }

      if (editing) {
        await updateReportSchedule(siteId, editing.id, payload)
        toast.success('Alert channel updated')
      } else {
        await createReportSchedule(siteId, payload)
        toast.success('Alert channel created')
      }
      onSaved()
      onClose()
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to save alert channel')
    } finally {
      setSaving(false)
    }
  }

  const webhookPlaceholder =
    form.channel === 'slack' ? 'https://hooks.slack.com/services/...'
    : form.channel === 'discord' ? 'https://discord.com/api/webhooks/...'
    : 'https://example.com/webhook'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editing ? 'Edit Alert Channel' : 'New Alert Channel'}>
      <div className="space-y-5">
        {/* Channel */}
        <div>
          <FormLabel>Channel</FormLabel>
          <ChannelPicker value={form.channel} onChange={(v) => updateField('channel', v)} />
        </div>

        {/* Recipients / URL */}
        {form.channel === 'email' ? (
          <div>
            <FormLabel htmlFor="alert-recipients">Recipients</FormLabel>
            <FormInput
              id="alert-recipients"
              value={form.recipients}
              onChange={(v) => updateField('recipients', v)}
              placeholder="email@example.com, another@example.com"
            />
            <p className="text-xs text-neutral-500 mt-1">Comma-separated email addresses</p>
          </div>
        ) : (
          <div>
            <FormLabel htmlFor="alert-webhook">Webhook URL</FormLabel>
            <FormInput
              id="alert-webhook"
              type="url"
              value={form.webhookUrl}
              onChange={(v) => updateField('webhookUrl', v)}
              placeholder={webhookPlaceholder}
            />
          </div>
        )}

        {/* Info box */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-800/30 p-3">
          <p className="text-xs text-neutral-400">
            Alerts are sent automatically when your site goes down or recovers.
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? <Spinner className="w-4 h-4" /> : editing ? 'Save Changes' : 'Add Channel'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Main Tab ─────────────────────────────────────────────────────────────────

export default function SiteReportsTab({ siteId }: { siteId: string }) {
  const { data: site } = useSite(siteId)
  const { data: reports = [], isLoading: reportsLoading, mutate: mutateReports } = useReportSchedules(siteId)
  const { data: alerts = [], isLoading: alertsLoading, mutate: mutateAlerts } = useAlertSchedules(siteId)

  // Report modal state
  const [reportModalOpen, setReportModalOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<ReportSchedule | null>(null)

  // Alert modal state
  const [alertModalOpen, setAlertModalOpen] = useState(false)
  const [editingAlert, setEditingAlert] = useState<ReportSchedule | null>(null)

  const siteTimezone = site?.timezone || 'UTC'
  const loading = reportsLoading || alertsLoading

  const openNewReport = () => { setEditingSchedule(null); setReportModalOpen(true) }
  const openEditReport = (schedule: ReportSchedule) => { setEditingSchedule(schedule); setReportModalOpen(true) }
  const openNewAlert = () => { setEditingAlert(null); setAlertModalOpen(true) }
  const openEditAlert = (schedule: ReportSchedule) => { setEditingAlert(schedule); setAlertModalOpen(true) }

  if (loading) return <div className="flex items-center justify-center py-12"><Spinner className="w-6 h-6 text-neutral-500" /></div>

  return (
    <div className="space-y-6">
      {/* Scheduled Reports */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-white mb-1">Scheduled Reports</h3>
            <p className="text-sm text-neutral-400">Automated analytics summaries via email or webhook.</p>
          </div>
          <Button variant="primary" className="text-sm gap-1.5" onClick={openNewReport}>
            <Plus weight="bold" className="w-3.5 h-3.5" /> Add Report
          </Button>
        </div>

        {reports.length === 0 ? (
          <EmptyState
            title="No scheduled reports yet"
            description="Get automated analytics summaries delivered to your inbox on a recurring schedule."
            icon={<FileText weight="regular" />}
            className="py-8"
          />
        ) : (
          <div className="space-y-1">
            {reports.map((r) => (
              <ScheduleRow key={r.id} schedule={r} siteId={siteId} onMutate={() => mutateReports()} onEdit={openEditReport} />
            ))}
          </div>
        )}
      </div>

      {/* Alert Channels */}
      <div className="pt-6 border-t border-neutral-800 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-white mb-1">Alert Channels</h3>
            <p className="text-sm text-neutral-400">Get notified when uptime monitors go down.</p>
          </div>
          <Button variant="primary" className="text-sm gap-1.5" onClick={openNewAlert}>
            <Plus weight="bold" className="w-3.5 h-3.5" /> Add Channel
          </Button>
        </div>

        {alerts.length === 0 ? (
          <EmptyState
            title="No alert channels yet"
            description="Add a channel to get notified when uptime monitors detect downtime."
            icon={<Bell weight="regular" />}
            className="py-8"
          />
        ) : (
          <div className="space-y-1">
            {alerts.map((a) => (
              <ScheduleRow key={a.id} schedule={a} siteId={siteId} onMutate={() => mutateAlerts()} onEdit={openEditAlert} />
            ))}
          </div>
        )}
      </div>

      {/* Report Schedule Modal */}
      {reportModalOpen && (
        <ReportScheduleModal
          isOpen={reportModalOpen}
          onClose={() => setReportModalOpen(false)}
          siteId={siteId}
          siteTimezone={siteTimezone}
          editing={editingSchedule}
          onSaved={() => mutateReports()}
        />
      )}

      {/* Alert Channel Modal */}
      {alertModalOpen && (
        <AlertChannelModal
          isOpen={alertModalOpen}
          onClose={() => setAlertModalOpen(false)}
          siteId={siteId}
          siteTimezone={siteTimezone}
          editing={editingAlert}
          onSaved={() => mutateAlerts()}
        />
      )}
    </div>
  )
}
