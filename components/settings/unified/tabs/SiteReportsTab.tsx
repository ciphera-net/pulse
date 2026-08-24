'use client'

import { useState } from 'react'
import { Button, toast, Spinner, Modal, Input, getAuthErrorMessage } from '@ciphera-net/facet'
import { Plus, Pencil, Trash, EnvelopeSimple, WebhooksLogo, PaperPlaneTilt, Bell } from '@phosphor-icons/react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { cn } from '@/lib/utils'
import { cdnUrl } from '@/lib/cdn'
import { useAlertSchedules, useSite } from '@/lib/swr/dashboard'
import { useCan } from '@/lib/auth/permissions'
import {
  createReportSchedule,
  updateReportSchedule,
  deleteReportSchedule,
  type ReportSchedule,
  type CreateReportScheduleRequest,
  type EmailConfig,
  type WebhookConfig,
} from '@/lib/api/report-schedules'
import { formatDateTime } from '@/lib/utils/formatDate'
import { SettingsPanel, PanelRows, EmptyRow } from '@/components/settings/panels'
import { StatusChip } from '@/components/settings/StatusChip'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'

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
  discord: <img src={cdnUrl('/icons/brands/discord.svg')} alt="Discord" width={16} height={16} className="inline-block" />,
  webhook: <WebhooksLogo weight="bold" className="w-4 h-4" />,
}

function ChannelIcon({ channel }: { channel: string }) {
  return <>{CHANNEL_ICONS[channel] ?? <PaperPlaneTilt weight="bold" className="w-4 h-4" />}</>
}

// ── Channel Row ──────────────────────────────────────────────────────────────

function ScheduleRow({
  schedule,
  siteId,
  onMutate,
  onEdit,
  canManage,
}: {
  schedule: ReportSchedule
  siteId: string
  onMutate: () => void
  onEdit: (schedule: ReportSchedule) => void
  canManage: boolean
}) {
  const [toggling, setToggling] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleToggle = async () => {
    if (toggling) return
    setToggling(true)
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
      toast.success(schedule.enabled ? 'Alert channel paused' : 'Alert channel enabled')
      onMutate()
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to update')
    } finally {
      setToggling(false)
    }
  }

  const handleDelete = async () => {
    try {
      await deleteReportSchedule(siteId, schedule.id)
      toast.success('Alert channel deleted')
      onMutate()
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to delete')
    }
  }

  const isEmail = schedule.channel === 'email' && 'recipients' in schedule.channel_config
  const recipients = isEmail ? ((schedule.channel_config as EmailConfig).recipients ?? []) : []
  const primaryLabel = isEmail ? (recipients[0] ?? schedule.channel) : schedule.channel
  const extraRecipients = recipients.length > 1 ? recipients.length - 1 : 0

  return (
    <TooltipProvider>
      <div className="flex items-center justify-between gap-4 px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-none',
              schedule.enabled ? 'bg-accent text-foreground' : 'bg-muted text-muted-foreground',
            )}
          >
            <ChannelIcon channel={schedule.channel} />
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-sm font-medium text-foreground">{primaryLabel}</p>
              {extraRecipients > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="shrink-0 cursor-default text-xs text-muted-foreground">+{extraRecipients} more</span>
                  </TooltipTrigger>
                  <TooltipContent>{recipients.slice(1).join(', ')}</TooltipContent>
                </Tooltip>
              )}
              {!schedule.enabled && (
                <StatusChip tone="neutral" className="shrink-0">Paused</StatusChip>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              downtime alerts
              {schedule.last_sent_at && (
                <span className="ml-1">· sent {formatDateTime(new Date(schedule.last_sent_at))}</span>
              )}
            </p>
            {schedule.last_error && (
              <p className="mt-0.5 truncate text-xs text-destructive">{schedule.last_error}</p>
            )}
          </div>
        </div>
        {canManage && (
          /* Row actions are ALWAYS visible (spec §6 / B12) — never a hover-only reveal. */
          <div className="flex shrink-0 items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(schedule)} aria-label="Edit">
                  <Pencil weight="bold" className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit</TooltipContent>
            </Tooltip>
            <Button variant="ghost" size="sm" onClick={handleToggle} disabled={toggling}>
              {toggling ? <Spinner className="w-3.5 h-3.5" /> : schedule.enabled ? 'Pause' : 'Enable'}
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                  aria-label="Delete"
                >
                  <Trash weight="bold" className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete</TooltipContent>
            </Tooltip>
          </div>
        )}

        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Delete alert channel"
          description="This alert channel will be permanently removed."
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleDelete}
        />
      </div>
    </TooltipProvider>
  )
}

// ── Ghost preview row (empty-state hint, spec §2.3) ───────────────────────────

function GhostRow({ icon, primary, secondary }: { icon: React.ReactNode; primary: string; secondary: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none bg-muted text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{primary}</p>
        <p className="text-xs text-muted-foreground">{secondary}</p>
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
          className={cn(
            'flex flex-col items-center gap-1.5 rounded-none border p-3 transition-colors',
            // Selected state is NEUTRAL (spec §2.3) — orange is reserved for the
            // page's one CTA, never a picked segment.
            value === ch
              ? 'border-input bg-accent text-foreground'
              : 'border-border text-muted-foreground hover:border-input hover:text-foreground',
          )}
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
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block font-semibold text-micro-label uppercase text-muted-foreground">
      {children}
    </label>
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
            <Input
              id="alert-recipients"
              value={form.recipients}
              onChange={(e) => updateField('recipients', e.target.value)}
              placeholder="email@example.com, another@example.com"
            />
            <p className="mt-1 text-xs text-muted-foreground">Comma-separated email addresses</p>
          </div>
        ) : (
          <div>
            <FormLabel htmlFor="alert-webhook">Webhook URL</FormLabel>
            <Input
              id="alert-webhook"
              type="url"
              value={form.webhookUrl}
              onChange={(e) => updateField('webhookUrl', e.target.value)}
              placeholder={webhookPlaceholder}
            />
          </div>
        )}

        {/* Info box */}
        <div className="rounded-none border border-border bg-muted p-3">
          <p className="text-xs text-muted-foreground">
            Alerts are sent automatically when your site goes down or recovers.
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="default" onClick={handleSubmit} disabled={saving}>
            {saving ? <Spinner className="w-4 h-4" /> : editing ? 'Save Changes' : 'Add Channel'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Main Tab ─────────────────────────────────────────────────────────────────

export default function SiteReportsTab({ siteId }: { siteId: string }) {
  const canManage = useCan('reports.manage')
  const { data: site } = useSite(siteId)
  const { data: alerts = [], isLoading: alertsLoading, isValidating: alertsValidating, error: alertsError, mutate: mutateAlerts } = useAlertSchedules(siteId)

  const [alertModalOpen, setAlertModalOpen] = useState(false)
  const [editingAlert, setEditingAlert] = useState<ReportSchedule | null>(null)

  const siteTimezone = site?.timezone || 'UTC'

  const openNewAlert = () => { setEditingAlert(null); setAlertModalOpen(true) }
  const openEditAlert = (schedule: ReportSchedule) => { setEditingAlert(schedule); setAlertModalOpen(true) }

  if (alertsLoading) return <div className="flex items-center justify-center py-12"><Spinner className="w-6 h-6 text-muted-foreground" /></div>

  return (
    <div className="space-y-8">
      {/* Alert Channels */}
      <SettingsPanel
        kicker="Alert channels"
        description="Get notified when uptime monitors go down."
        action={canManage ? (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={openNewAlert}>
            <Plus weight="bold" className="h-3.5 w-3.5" /> Add channel
          </Button>
        ) : undefined}
      >
        {alertsError && alerts.length === 0 ? (
          <div className="p-5">
            <SettingsErrorState
              variant="banner"
              message="We couldn't load your alert channels. It may be a temporary problem."
              onRetry={() => mutateAlerts()}
              retrying={alertsValidating}
            />
          </div>
        ) : alerts.length === 0 ? (
          <EmptyRow
            icon={<Bell weight="regular" />}
            title="No alert channels yet"
            caption="Add a channel to get notified when uptime monitors detect downtime."
            action={canManage ? (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={openNewAlert}>
                <Plus weight="bold" className="h-3.5 w-3.5" /> Add channel
              </Button>
            ) : undefined}
            ghost={<GhostRow icon={<WebhooksLogo weight="bold" className="h-4 w-4" />} primary="alerts@example.com" secondary="downtime alerts" />}
          />
        ) : (
          <PanelRows>
            {alerts.map((a) => (
              <ScheduleRow key={a.id} schedule={a} siteId={siteId} onMutate={() => mutateAlerts()} onEdit={openEditAlert} canManage={canManage} />
            ))}
          </PanelRows>
        )}
      </SettingsPanel>

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
