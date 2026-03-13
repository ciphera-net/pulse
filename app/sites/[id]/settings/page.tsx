'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { updateSite, resetSiteData, deleteSite, type Site, type GeoDataLevel } from '@/lib/api/sites'
import { createGoal, updateGoal, deleteGoal, type Goal } from '@/lib/api/goals'
import { createReportSchedule, updateReportSchedule, deleteReportSchedule, testReportSchedule, type ReportSchedule, type CreateReportScheduleRequest, type EmailConfig, type WebhookConfig } from '@/lib/api/report-schedules'
import { toast } from '@ciphera-net/ui'
import { getAuthErrorMessage } from '@ciphera-net/ui'
import { SettingsFormSkeleton, GoalsListSkeleton, useMinimumLoading, useSkeletonFade } from '@/components/skeletons'
import VerificationModal from '@/components/sites/VerificationModal'
import ScriptSetupBlock from '@/components/sites/ScriptSetupBlock'
import { PasswordInput } from '@ciphera-net/ui'
import { Select, Modal, Button } from '@ciphera-net/ui'
import { APP_URL } from '@/lib/api/client'
import { generatePrivacySnippet } from '@/lib/utils/privacySnippet'
import { useUnsavedChanges } from '@/lib/hooks/useUnsavedChanges'
import { useSite, useGoals, useReportSchedules, useSubscription } from '@/lib/swr/dashboard'
import { getRetentionOptionsForPlan, formatRetentionMonths } from '@/lib/plans'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/lib/auth/context'
import {
  SettingsIcon,
  GlobeIcon,
  CheckIcon,
  AlertTriangleIcon,
  ZapIcon,
} from '@ciphera-net/ui'
import { PaperPlaneTilt, Envelope, WebhooksLogo, SpinnerGap, Trash, PencilSimple, Play } from '@phosphor-icons/react'

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'America/Toronto',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Asia/Dubai',
  'Australia/Sydney',
  'Pacific/Auckland',
]

export default function SiteSettingsPage() {
  const { user } = useAuth()
  const canEdit = user?.role === 'owner' || user?.role === 'admin'

  const params = useParams()
  const router = useRouter()
  const siteId = params.id as string

  const { data: site, isLoading: siteLoading, mutate: mutateSite } = useSite(siteId)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'general' | 'visibility' | 'data' | 'goals' | 'reports'>('general')

  const [formData, setFormData] = useState({
    name: '',
    timezone: 'UTC',
    is_public: false,
    password: '',
    excluded_paths: '',
    // Data collection settings
    collect_page_paths: true,
    collect_referrers: true,
    collect_device_info: true,
    collect_geo_data: 'full' as GeoDataLevel,
    collect_screen_resolution: true,
    // Performance insights setting
    enable_performance_insights: false,
    // Bot and noise filtering
    filter_bots: true,
    // Hide unknown locations
    hide_unknown_locations: false,
    // Data retention (6 = free-tier max; safe default)
    data_retention_months: 6
  })
  const { data: subscription, error: subscriptionError, mutate: mutateSubscription } = useSubscription()
  const [linkCopied, setLinkCopied] = useState(false)
  const [snippetCopied, setSnippetCopied] = useState(false)
  const [showVerificationModal, setShowVerificationModal] = useState(false)
  const [isPasswordEnabled, setIsPasswordEnabled] = useState(false)
  const { data: goals = [], isLoading: goalsLoading, mutate: mutateGoals } = useGoals(siteId)
  const [goalModalOpen, setGoalModalOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null)
  const [goalForm, setGoalForm] = useState({ name: '', event_name: '' })
  const [goalSaving, setGoalSaving] = useState(false)
  const initialFormRef = useRef<string>('')

  // Report schedules
  const { data: reportSchedules = [], isLoading: reportLoading, mutate: mutateReportSchedules } = useReportSchedules(siteId)
  const [reportModalOpen, setReportModalOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<ReportSchedule | null>(null)
  const [reportSaving, setReportSaving] = useState(false)
  const [reportTesting, setReportTesting] = useState<string | null>(null)
  const [reportForm, setReportForm] = useState({
    channel: 'email' as string,
    recipients: '',
    webhookUrl: '',
    frequency: 'weekly' as string,
    reportType: 'summary' as string,
    timezone: '',
    sendHour: 9,
    sendDay: 1,
  })

  useEffect(() => {
    if (!site) return
    setFormData({
      name: site.name,
      timezone: site.timezone || 'UTC',
      is_public: site.is_public || false,
      password: '',
      excluded_paths: (site.excluded_paths || []).join('\n'),
      collect_page_paths: site.collect_page_paths ?? true,
      collect_referrers: site.collect_referrers ?? true,
      collect_device_info: site.collect_device_info ?? true,
      collect_geo_data: site.collect_geo_data || 'full',
      collect_screen_resolution: site.collect_screen_resolution ?? true,
      enable_performance_insights: site.enable_performance_insights ?? false,
      filter_bots: site.filter_bots ?? true,
      hide_unknown_locations: site.hide_unknown_locations ?? false,
      data_retention_months: site.data_retention_months ?? 6
    })
    initialFormRef.current = JSON.stringify({
      name: site.name,
      timezone: site.timezone || 'UTC',
      is_public: site.is_public || false,
      excluded_paths: (site.excluded_paths || []).join('\n'),
      collect_page_paths: site.collect_page_paths ?? true,
      collect_referrers: site.collect_referrers ?? true,
      collect_device_info: site.collect_device_info ?? true,
      collect_geo_data: site.collect_geo_data || 'full',
      collect_screen_resolution: site.collect_screen_resolution ?? true,
      enable_performance_insights: site.enable_performance_insights ?? false,
      filter_bots: site.filter_bots ?? true,
      hide_unknown_locations: site.hide_unknown_locations ?? false,
      data_retention_months: site.data_retention_months ?? 6
    })
    setIsPasswordEnabled(!!site.has_password)
  }, [site])

  // * Snap data_retention_months to nearest valid option when subscription loads
  useEffect(() => {
    if (!subscription) return
    const opts = getRetentionOptionsForPlan(subscription.plan_id)
    const values = opts.map(o => o.value)
    const maxVal = Math.max(...values)
    setFormData(prev => {
      if (values.includes(prev.data_retention_months)) return prev
      const bestFit = values.filter(v => v <= prev.data_retention_months).pop() ?? maxVal
      return { ...prev, data_retention_months: Math.min(bestFit, maxVal) }
    })
  }, [subscription])

  const resetReportForm = () => {
    setReportForm({
      channel: 'email',
      recipients: '',
      webhookUrl: '',
      frequency: 'weekly',
      reportType: 'summary',
      timezone: site?.timezone || '',
      sendHour: 9,
      sendDay: 1,
    })
  }

  const openEditSchedule = (schedule: ReportSchedule) => {
    setEditingSchedule(schedule)
    const isEmail = schedule.channel === 'email'
    setReportForm({
      channel: schedule.channel,
      recipients: isEmail ? (schedule.channel_config as EmailConfig).recipients.join(', ') : '',
      webhookUrl: !isEmail ? (schedule.channel_config as WebhookConfig).url : '',
      frequency: schedule.frequency,
      reportType: schedule.report_type,
      timezone: schedule.timezone || site?.timezone || '',
      sendHour: schedule.send_hour ?? 9,
      sendDay: schedule.send_day ?? (schedule.frequency === 'monthly' ? 1 : 0),
    })
    setReportModalOpen(true)
  }

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    let channelConfig: EmailConfig | WebhookConfig
    if (reportForm.channel === 'email') {
      const recipients = reportForm.recipients.split(',').map(r => r.trim()).filter(r => r.length > 0)
      if (recipients.length === 0) {
        toast.error('At least one recipient email is required')
        return
      }
      channelConfig = { recipients }
    } else {
      if (!reportForm.webhookUrl.trim()) {
        toast.error('Webhook URL is required')
        return
      }
      channelConfig = { url: reportForm.webhookUrl.trim() }
    }

    const payload: CreateReportScheduleRequest = {
      channel: reportForm.channel,
      channel_config: channelConfig,
      frequency: reportForm.frequency,
      timezone: reportForm.timezone || undefined,
      report_type: reportForm.reportType,
      send_hour: reportForm.sendHour,
      ...(reportForm.frequency !== 'daily' ? { send_day: reportForm.sendDay } : {}),
    }

    setReportSaving(true)
    try {
      if (editingSchedule) {
        await updateReportSchedule(siteId, editingSchedule.id, payload)
        toast.success('Report schedule updated')
      } else {
        await createReportSchedule(siteId, payload)
        toast.success('Report schedule created')
      }
      setReportModalOpen(false)
      mutateReportSchedules()
    } catch (error: unknown) {
      toast.error(getAuthErrorMessage(error) || 'Failed to save report schedule')
    } finally {
      setReportSaving(false)
    }
  }

  const handleReportDelete = async (schedule: ReportSchedule) => {
    if (!confirm('Delete this report schedule?')) return
    try {
      await deleteReportSchedule(siteId, schedule.id)
      toast.success('Report schedule deleted')
      mutateReportSchedules()
    } catch (error: unknown) {
      toast.error(getAuthErrorMessage(error) || 'Failed to delete report schedule')
    }
  }

  const handleReportToggle = async (schedule: ReportSchedule) => {
    try {
      await updateReportSchedule(siteId, schedule.id, { enabled: !schedule.enabled })
      toast.success(schedule.enabled ? 'Report paused' : 'Report enabled')
      mutateReportSchedules()
    } catch (error: unknown) {
      toast.error(getAuthErrorMessage(error) || 'Failed to update report schedule')
    }
  }

  const handleReportTest = async (schedule: ReportSchedule) => {
    setReportTesting(schedule.id)
    try {
      await testReportSchedule(siteId, schedule.id)
      toast.success('Test report sent successfully')
    } catch (error: unknown) {
      toast.error(getAuthErrorMessage(error) || 'Failed to send test report')
    } finally {
      setReportTesting(null)
    }
  }

  const getChannelLabel = (channel: string) => {
    switch (channel) {
      case 'email': return 'Email'
      case 'slack': return 'Slack'
      case 'discord': return 'Discord'
      case 'webhook': return 'Webhook'
      default: return channel
    }
  }

  const getFrequencyLabel = (frequency: string) => {
    switch (frequency) {
      case 'daily': return 'Daily'
      case 'weekly': return 'Weekly'
      case 'monthly': return 'Monthly'
      default: return frequency
    }
  }

  const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

  const formatHour = (hour: number) => {
    if (hour === 0) return '12:00 AM'
    if (hour === 12) return '12:00 PM'
    return hour < 12 ? `${hour}:00 AM` : `${hour - 12}:00 PM`
  }

  const getScheduleDescription = (schedule: ReportSchedule) => {
    const hour = formatHour(schedule.send_hour ?? 9)
    const tz = schedule.timezone || 'UTC'
    switch (schedule.frequency) {
      case 'daily':
        return `Every day at ${hour} (${tz})`
      case 'weekly': {
        const day = WEEKDAY_NAMES[schedule.send_day ?? 0] || 'Monday'
        return `Every ${day} at ${hour} (${tz})`
      }
      case 'monthly': {
        const d = schedule.send_day ?? 1
        const suffix = d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th'
        return `${d}${suffix} of each month at ${hour} (${tz})`
      }
      default:
        return schedule.frequency
    }
  }

  const getReportTypeLabel = (type: string) => {
    switch (type) {
      case 'summary': return 'Summary'
      case 'pages': return 'Pages'
      case 'sources': return 'Sources'
      case 'goals': return 'Goals'
      default: return type
    }
  }

  const openAddGoal = () => {
    setEditingGoal(null)
    setGoalForm({ name: '', event_name: '' })
    setGoalModalOpen(true)
  }

  const openEditGoal = (goal: Goal) => {
    setEditingGoal(goal)
    setGoalForm({ name: goal.name, event_name: goal.event_name })
    setGoalModalOpen(true)
  }

  const handleGoalSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!goalForm.name.trim() || !goalForm.event_name.trim()) {
      toast.error('Name and event name are required')
      return
    }
    const eventName = goalForm.event_name.trim().toLowerCase().replace(/\s+/g, '_')
    if (eventName.length > 64) {
      toast.error('Event name must be 64 characters or less')
      return
    }
    if (!/^[a-zA-Z0-9_]+$/.test(eventName)) {
      toast.error('Event name can only contain letters, numbers, and underscores')
      return
    }
    const duplicateEventName = editingGoal
      ? goals.some((g) => g.id !== editingGoal.id && g.event_name === eventName)
      : goals.some((g) => g.event_name === eventName)
    if (duplicateEventName) {
      toast.error('A goal with this event name already exists')
      return
    }
    setGoalSaving(true)
    try {
      if (editingGoal) {
        await updateGoal(siteId, editingGoal.id, { name: goalForm.name.trim(), event_name: eventName })
        toast.success('Goal updated')
      } else {
        await createGoal(siteId, { name: goalForm.name.trim(), event_name: eventName })
        toast.success('Goal created')
      }
      setGoalModalOpen(false)
      mutateGoals()
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to save goal')
    } finally {
      setGoalSaving(false)
    }
  }

  const handleDeleteGoal = async (goal: Goal) => {
    if (!confirm(`Delete goal "${goal.name}"?`)) return
    try {
      await deleteGoal(siteId, goal.id)
      toast.success('Goal deleted')
      mutateGoals()
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to delete goal')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const excludedPathsArray = formData.excluded_paths
        .split('\n')
        .map(p => p.trim())
        .filter(p => p.length > 0)

      await updateSite(siteId, {
        name: formData.name,
        timezone: formData.timezone,
        is_public: formData.is_public,
        password: isPasswordEnabled ? (formData.password || undefined) : undefined,
        clear_password: !isPasswordEnabled,
        excluded_paths: excludedPathsArray,
        // Data collection settings
        collect_page_paths: formData.collect_page_paths,
        collect_referrers: formData.collect_referrers,
        collect_device_info: formData.collect_device_info,
        collect_geo_data: formData.collect_geo_data,
        collect_screen_resolution: formData.collect_screen_resolution,
        // Performance insights setting
        enable_performance_insights: formData.enable_performance_insights,
        // Bot and noise filtering
        filter_bots: formData.filter_bots,
        // Hide unknown locations
        hide_unknown_locations: formData.hide_unknown_locations,
        // Data retention
        data_retention_months: formData.data_retention_months
      })
      toast.success('Site updated successfully')
      initialFormRef.current = JSON.stringify({
        name: formData.name,
        timezone: formData.timezone,
        is_public: formData.is_public,
        excluded_paths: formData.excluded_paths,
        collect_page_paths: formData.collect_page_paths,
        collect_referrers: formData.collect_referrers,
        collect_device_info: formData.collect_device_info,
        collect_geo_data: formData.collect_geo_data,
        collect_screen_resolution: formData.collect_screen_resolution,
        enable_performance_insights: formData.enable_performance_insights,
        filter_bots: formData.filter_bots,
        hide_unknown_locations: formData.hide_unknown_locations,
        data_retention_months: formData.data_retention_months
      })
      mutateSite()
    } catch (error: unknown) {
      toast.error(getAuthErrorMessage(error) || 'Failed to save site settings')
    } finally {
      setSaving(false)
    }
  }

  const handleResetData = async () => {
    if (!confirm('Are you sure you want to delete ALL data for this site? This action cannot be undone.')) {
      return
    }

    try {
      await resetSiteData(siteId)
      toast.success('All site data has been reset')
    } catch (error: unknown) {
      toast.error(getAuthErrorMessage(error) || 'Failed to reset site data')
    }
  }

  const handleDeleteSite = async () => {
    const confirmation = prompt('To confirm deletion, please type the site domain:')
    if (confirmation !== site?.domain) {
      if (confirmation) toast.error('Domain does not match')
      return
    }

    try {
      await deleteSite(siteId)
      toast.success('Site deleted successfully')
      router.push('/')
    } catch (error: unknown) {
      toast.error(getAuthErrorMessage(error) || 'Failed to delete site')
    }
  }

  const copyLink = () => {
    const link = `${APP_URL}/share/${siteId}`
    navigator.clipboard.writeText(link)
    setLinkCopied(true)
    toast.success('Link copied to clipboard')
    setTimeout(() => setLinkCopied(false), 2000)
  }

  const copySnippet = () => {
    if (!site) return
    navigator.clipboard.writeText(generatePrivacySnippet(site))
    setSnippetCopied(true)
    toast.success('Privacy snippet copied to clipboard')
    setTimeout(() => setSnippetCopied(false), 2000)
  }

  const isFormDirty = initialFormRef.current !== '' && JSON.stringify({
    name: formData.name,
    timezone: formData.timezone,
    is_public: formData.is_public,
    excluded_paths: formData.excluded_paths,
    collect_page_paths: formData.collect_page_paths,
    collect_referrers: formData.collect_referrers,
    collect_device_info: formData.collect_device_info,
    collect_geo_data: formData.collect_geo_data,
    collect_screen_resolution: formData.collect_screen_resolution,
    enable_performance_insights: formData.enable_performance_insights,
    filter_bots: formData.filter_bots,
    hide_unknown_locations: formData.hide_unknown_locations,
    data_retention_months: formData.data_retention_months
  }) !== initialFormRef.current

  useUnsavedChanges(isFormDirty)

  useEffect(() => {
    if (site?.domain) document.title = `Settings · ${site.domain} | Pulse`
  }, [site?.domain])

  const showSkeleton = useMinimumLoading(siteLoading && !site)
  const fadeClass = useSkeletonFade(showSkeleton)

  if (showSkeleton) {
    return (
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 pb-8">
        <div className="space-y-8">
          <div>
            <div className="h-8 w-40 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800 mb-2" />
            <div className="h-4 w-64 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
          </div>
          <div className="flex flex-col md:flex-row gap-8">
            <nav className="w-full md:w-64 flex-shrink-0 space-y-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-800" />
              ))}
            </nav>
            <div className="flex-1 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 md:p-8">
              <SettingsFormSkeleton />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!site) {
    return (
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 pb-8">
        <p className="text-neutral-600 dark:text-neutral-400">Site not found</p>
      </div>
    )
  }

  return (
    <div className={`w-full max-w-6xl mx-auto px-4 sm:px-6 pb-8 ${fadeClass}`}>

      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Site Settings</h1>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            Manage settings for <span className="font-medium text-neutral-900 dark:text-white">{site.domain}</span>
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar Navigation */}
        <nav className="w-full md:w-64 flex-shrink-0 space-y-1" role="tablist" aria-label="Site settings sections">
          <button
            onClick={() => setActiveTab('general')}
            role="tab"
            aria-selected={activeTab === 'general'}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2 ${
              activeTab === 'general'
                ? 'bg-brand-orange/10 text-brand-orange'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <SettingsIcon className="w-5 h-5" />
            General
          </button>
          <button
            onClick={() => setActiveTab('visibility')}
            role="tab"
            aria-selected={activeTab === 'visibility'}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2 ${
              activeTab === 'visibility'
                ? 'bg-brand-orange/10 text-brand-orange'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <GlobeIcon className="w-5 h-5" />
            Visibility
          </button>
          <button
            onClick={() => setActiveTab('data')}
            role="tab"
            aria-selected={activeTab === 'data'}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2 ${
              activeTab === 'data'
                ? 'bg-brand-orange/10 text-brand-orange'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <SettingsIcon className="w-5 h-5" />
            Data & Privacy
          </button>
          <button
            onClick={() => setActiveTab('goals')}
            role="tab"
            aria-selected={activeTab === 'goals'}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2 ${
              activeTab === 'goals'
                ? 'bg-brand-orange/10 text-brand-orange'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <ZapIcon className="w-5 h-5" />
            Goals & Events
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            role="tab"
            aria-selected={activeTab === 'reports'}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2 ${
              activeTab === 'reports'
                ? 'bg-brand-orange/10 text-brand-orange'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <PaperPlaneTilt className="w-5 h-5" />
            Reports
          </button>
        </nav>

        {/* Content Area */}
        <div className="flex-1 relative">
          {!canEdit && (
            <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/10 text-amber-800 dark:text-amber-200 rounded-xl border border-amber-200 dark:border-amber-800 flex items-center gap-3">
              <AlertTriangleIcon className="w-5 h-5" />
              <p className="text-sm font-medium">You have read-only access to this site. Contact an admin to make changes.</p>
            </div>
          )}

          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 md:p-8 shadow-sm"
          >
            {activeTab === 'general' && (
              <div className="space-y-12">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-1">General Configuration</h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">Update your site details and tracking script.</p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label htmlFor="name" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        Site Name
                      </label>
                      <input
                        type="text"
                        id="name"
                        required
                        maxLength={100}
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-4 py-2 border border-neutral-200 dark:border-neutral-800 rounded-lg bg-neutral-50/50 dark:bg-neutral-900/50 focus:bg-white dark:focus:bg-neutral-900 
                        focus:border-brand-orange focus:ring-4 focus:ring-brand-orange/10 outline-none transition-all duration-200 dark:text-white"
                      />
                      {formData.name.length > 80 && (
                        <span className={`text-xs tabular-nums ${formData.name.length > 90 ? 'text-amber-500' : 'text-neutral-400'}`}>{formData.name.length}/100</span>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="timezone" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        Timezone
                      </label>
                      <Select
                        id="timezone"
                        value={formData.timezone}
                        onChange={(v) => setFormData({ ...formData, timezone: v })}
                        options={TIMEZONES.map((tz) => ({ value: tz, label: tz }))}
                        variant="input"
                        fullWidth
                        align="left"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        Domain
                      </label>
                      <input
                        type="text"
                        value={site.domain}
                        disabled
                        className="w-full px-4 py-2 border border-neutral-200 dark:border-neutral-800 rounded-lg bg-neutral-100 dark:bg-neutral-800/50 text-neutral-500 dark:text-neutral-400 cursor-not-allowed"
                      />
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        Domain cannot be changed after creation
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800">
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">Tracking Script</h3>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
                      Add this script to your website to start tracking visitors. Choose your framework for setup instructions.
                    </p>
                    <ScriptSetupBlock
                      site={{ domain: site.domain, name: site.name }}
                      showFrameworkPicker
                      className="mb-4"
                    />

                    <div className="flex items-center gap-4 mt-4">
                      <button
                        type="button"
                        onClick={() => setShowVerificationModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-all text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2"
                      >
                        <ZapIcon className="w-4 h-4" />
                        Verify Installation
                      </button>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        Check if your site is sending data correctly.
                      </p>
                    </div>
                  </div>

                    <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">
                    {canEdit && (
                      <Button type="submit" disabled={saving} isLoading={saving}>
                        Save Changes
                      </Button>
                    )}
                    </div>
                  </form>

                  {canEdit && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-2xl font-bold text-red-600 dark:text-red-500 mb-1">Danger Zone</h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">Irreversible actions for your site.</p>
                    </div>

                  <div className="space-y-4">
                    <div className="p-4 border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10 rounded-2xl flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-red-900 dark:text-red-200">Reset Data</h3>
                        <p className="text-sm text-red-700 dark:text-red-300 mt-1">Delete all stats and events. This cannot be undone.</p>
                      </div>
                      <button
                        onClick={handleResetData}
                        className="px-4 py-2 bg-white dark:bg-neutral-900 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                      >
                        Reset Data
                      </button>
                    </div>

                    <div className="p-4 border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10 rounded-2xl flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-red-900 dark:text-red-200">Delete Site</h3>
                        <p className="text-sm text-red-700 dark:text-red-300 mt-1">Permanently delete this site and all data.</p>
                      </div>
                      <button
                        onClick={handleDeleteSite}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                      >
                        Delete Site
                      </button>
                    </div>
                  </div>
                </div>
                )}
              </div>
            )}

            {activeTab === 'visibility' && (
              <div className="space-y-12">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-1">Visibility Settings</h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">Manage who can view your dashboard.</p>
                  </div>

                  <div className="p-6 bg-neutral-50 dark:bg-neutral-900/50 rounded-2xl border border-neutral-100 dark:border-neutral-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-white dark:bg-neutral-800 rounded-lg text-neutral-400">
                          <GlobeIcon className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="font-medium text-neutral-900 dark:text-white">Public Dashboard</h3>
                          <p className="text-sm text-neutral-500 dark:text-neutral-400">
                            Allow anyone with the link to view this dashboard
                          </p>
                        </div>
                      </div>
                      
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.is_public}
                          onChange={(e) => setFormData({ ...formData, is_public: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-orange/20 dark:peer-focus:ring-brand-orange/20 rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-neutral-600 peer-checked:bg-brand-orange"></div>
                      </label>
                    </div>

                    <AnimatePresence>
                      {formData.is_public && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-6 pt-6 border-t border-neutral-200 dark:border-neutral-800 overflow-hidden space-y-6"
                        >
                          <div>
                            <label className="block text-sm font-medium mb-2 text-neutral-900 dark:text-white">
                              Public Link
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                readOnly
                                value={`${APP_URL}/share/${siteId}`}
                                className="flex-1 px-4 py-2 border border-neutral-200 dark:border-neutral-800 rounded-lg bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 font-mono text-sm"
                              />
                              <button
                                type="button"
                                onClick={copyLink}
                                className="px-4 py-2 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white rounded-xl font-medium hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2"
                              >
                                {linkCopied ? 'Copied!' : 'Copy Link'}
                              </button>
                            </div>
                            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                              Share this link with others to view the dashboard.
                            </p>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-4">
                              <div>
                                <h3 className="text-sm font-medium text-neutral-900 dark:text-white">Password Protection</h3>
                                <p className="text-xs text-neutral-500 mt-1">Restrict access to this dashboard.</p>
                              </div>
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input 
                                  type="checkbox" 
                                  checked={isPasswordEnabled} 
                                  onChange={(e) => {
                                    setIsPasswordEnabled(e.target.checked);
                                    if (!e.target.checked) setFormData({...formData, password: ''}); 
                                  }}
                                  className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-orange/20 dark:peer-focus:ring-brand-orange/20 rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-neutral-600 peer-checked:bg-brand-orange"></div>
                              </label>
                            </div>

                            <AnimatePresence>
                              {isPasswordEnabled && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="overflow-hidden"
                                >
                                  <PasswordInput
                                    id="password"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    placeholder={site.has_password ? "Change password (leave empty to keep current)" : "Set a password"}
                                  />
                                  <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                                    Visitors will need to enter this password to view the dashboard.
                                  </p>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">
                    {canEdit && (
                      <Button type="submit" disabled={saving} isLoading={saving}>
                        Save Changes
                      </Button>
                    )}
                  </div>
                </form>
              </div>
            )}

            {activeTab === 'data' && (
              <div className="space-y-12">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-1">Data & Privacy</h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">Control what visitor data is collected. Less data = more privacy.</p>
                  </div>

                  {/* Data Collection Controls */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Data Collection</h3>

                    {/* Page Paths Toggle */}
                    <div className="p-6 bg-neutral-50 dark:bg-neutral-900/50 rounded-2xl border border-neutral-100 dark:border-neutral-800">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-neutral-900 dark:text-white">Page Paths</h4>
                          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                            Track which pages visitors view
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.collect_page_paths}
                            onChange={(e) => setFormData({ ...formData, collect_page_paths: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-orange/20 dark:peer-focus:ring-brand-orange/20 rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-neutral-600 peer-checked:bg-brand-orange"></div>
                        </label>
                      </div>
                    </div>

                    {/* Referrers Toggle */}
                    <div className="p-6 bg-neutral-50 dark:bg-neutral-900/50 rounded-2xl border border-neutral-100 dark:border-neutral-800">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-neutral-900 dark:text-white">Referrers</h4>
                          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                            Track where visitors come from
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.collect_referrers}
                            onChange={(e) => setFormData({ ...formData, collect_referrers: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-orange/20 dark:peer-focus:ring-brand-orange/20 rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-neutral-600 peer-checked:bg-brand-orange"></div>
                        </label>
                      </div>
                    </div>

                    {/* Device Info Toggle */}
                    <div className="p-6 bg-neutral-50 dark:bg-neutral-900/50 rounded-2xl border border-neutral-100 dark:border-neutral-800">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-neutral-900 dark:text-white">Device Info</h4>
                          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                            Track browser, OS, and device type
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.collect_device_info}
                            onChange={(e) => setFormData({ ...formData, collect_device_info: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-orange/20 dark:peer-focus:ring-brand-orange/20 rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-neutral-600 peer-checked:bg-brand-orange"></div>
                        </label>
                      </div>
                    </div>

                    {/* Geographic Data Dropdown */}
                    <div className="p-6 bg-neutral-50 dark:bg-neutral-900/50 rounded-2xl border border-neutral-100 dark:border-neutral-800">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-neutral-900 dark:text-white">Geographic Data</h4>
                          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                            Control location tracking granularity
                          </p>
                        </div>
                        <Select
                          value={formData.collect_geo_data}
                          onChange={(v) => setFormData({ ...formData, collect_geo_data: v as GeoDataLevel })}
                          options={[
                            { value: 'full', label: 'Full (country, region, city)' },
                            { value: 'country', label: 'Country only' },
                            { value: 'none', label: 'None' },
                          ]}
                          variant="input"
                          align="right"
                          className="min-w-[200px]"
                        />
                      </div>
                    </div>

                    {/* Screen Resolution Toggle */}
                    <div className="p-6 bg-neutral-50 dark:bg-neutral-900/50 rounded-2xl border border-neutral-100 dark:border-neutral-800">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-neutral-900 dark:text-white">Screen Resolution</h4>
                          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                            Track visitor screen sizes
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.collect_screen_resolution}
                            onChange={(e) => setFormData({ ...formData, collect_screen_resolution: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-orange/20 dark:peer-focus:ring-brand-orange/20 rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-neutral-600 peer-checked:bg-brand-orange"></div>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Bot and noise filtering */}
                  <div className="space-y-4 pt-6 border-t border-neutral-100 dark:border-neutral-800">
                    <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Filtering</h3>
                    <div className="p-6 bg-neutral-50 dark:bg-neutral-900/50 rounded-2xl border border-neutral-100 dark:border-neutral-800">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-neutral-900 dark:text-white">Filter bots and referrer spam</h4>
                          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                            Exclude known crawlers, scrapers, and referrer spam domains from your stats
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.filter_bots}
                            onChange={(e) => setFormData({ ...formData, filter_bots: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-orange/20 dark:peer-focus:ring-brand-orange/20 rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-neutral-600 peer-checked:bg-brand-orange"></div>
                        </label>
                      </div>
                    </div>
                    <div className="p-6 bg-neutral-50 dark:bg-neutral-900/50 rounded-2xl border border-neutral-100 dark:border-neutral-800">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-neutral-900 dark:text-white">Hide unknown locations</h4>
                          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                            Exclude entries where geographic data could not be resolved from location stats
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.hide_unknown_locations}
                            onChange={(e) => setFormData({ ...formData, hide_unknown_locations: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-orange/20 dark:peer-focus:ring-brand-orange/20 rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-neutral-600 peer-checked:bg-brand-orange"></div>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Performance Insights Toggle */}
                  <div className="space-y-4 pt-6 border-t border-neutral-100 dark:border-neutral-800">
                    <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Performance Insights</h3>
                    <div className="p-6 bg-neutral-50 dark:bg-neutral-900/50 rounded-2xl border border-neutral-100 dark:border-neutral-800">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-neutral-900 dark:text-white">Performance Insights (Add-on)</h4>
                          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                            Track Core Web Vitals (LCP, CLS, INP) to monitor site performance
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.enable_performance_insights}
                            onChange={(e) => setFormData({ ...formData, enable_performance_insights: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-orange/20 dark:peer-focus:ring-brand-orange/20 rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-neutral-600 peer-checked:bg-brand-orange"></div>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Data Retention */}
                  <div className="space-y-4 pt-6 border-t border-neutral-100 dark:border-neutral-800">
                    <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Data Retention</h3>
                    {!!subscriptionError && (
                      <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 flex items-center justify-between gap-3">
                        <p className="text-sm text-amber-800 dark:text-amber-200">
                          Plan limits could not be loaded. Options shown may be limited.
                        </p>
                        <button
                          type="button"
                          onClick={() => mutateSubscription()}
                          className="shrink-0 text-sm font-medium text-amber-800 dark:text-amber-200 hover:underline"
                        >
                          Retry
                        </button>
                      </div>
                    )}
                    <div className="p-6 bg-neutral-50 dark:bg-neutral-900/50 rounded-2xl border border-neutral-100 dark:border-neutral-800">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-neutral-900 dark:text-white">Keep raw event data for</h4>
                          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                            Events older than this are automatically deleted. Aggregated daily stats are kept permanently.
                          </p>
                        </div>
                        <Select
                          value={String(formData.data_retention_months)}
                          onChange={(v) => setFormData({ ...formData, data_retention_months: Number(v) })}
                          options={getRetentionOptionsForPlan(subscription?.plan_id).map(opt => ({
                            value: String(opt.value),
                            label: opt.label,
                          }))}
                          variant="input"
                          align="right"
                          className="min-w-[160px]"
                        />
                      </div>
                      {subscription?.plan_id && subscription.plan_id !== 'free' && (
                        <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-3">
                          Your {subscription.plan_id} plan supports up to {formatRetentionMonths(
                            getRetentionOptionsForPlan(subscription.plan_id).at(-1)?.value ?? 6
                          )} of data retention.
                        </p>
                      )}
                      {(!subscription?.plan_id || subscription.plan_id === 'free') && (
                        <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-3">
                          Free plan supports up to 6 months. <a href="/pricing" className="text-brand-orange hover:underline">Upgrade</a> for longer retention.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Excluded Paths */}
                  <div className="space-y-4 pt-6 border-t border-neutral-100 dark:border-neutral-800">
                    <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Path Filtering</h3>
                    <div className="space-y-1.5">
                      <label htmlFor="excludedPaths" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        Excluded Paths
                      </label>
                      <div className="relative">
                        <textarea
                          id="excludedPaths"
                          rows={4}
                          value={formData.excluded_paths}
                          onChange={(e) => setFormData({ ...formData, excluded_paths: e.target.value })}
                          placeholder="/admin/*&#10;/staging/*"
                          className="w-full px-4 py-3 border border-neutral-200 dark:border-neutral-800 rounded-lg bg-neutral-50/50 dark:bg-neutral-900/50 focus:bg-white dark:focus:bg-neutral-900
                          focus:border-brand-orange focus:ring-4 focus:ring-brand-orange/10 outline-none transition-all duration-200 dark:text-white font-mono text-sm"
                        />
                      </div>
                      <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">
                        Enter paths to exclude from tracking (one per line). Supports wildcards (e.g., /admin/*).
                      </p>
                    </div>
                  </div>

                  {/* For your privacy policy */}
                  <div className="space-y-4 pt-6 border-t border-neutral-100 dark:border-neutral-800">
                    <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      For your privacy policy
                    </h3>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                      Copy the text below into your site&apos;s Privacy Policy to describe your use of Pulse.
                      It updates automatically based on your saved settings above.
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-500">
                      This is provided for convenience and is not legal advice. You are responsible for ensuring
                      your privacy policy is accurate and complies with applicable laws.
                    </p>
                    <div className="relative">
                      <textarea
                        readOnly
                        rows={6}
                        value={site ? generatePrivacySnippet(site) : ''}
                        className="w-full px-4 py-3 pr-12 border border-neutral-200 dark:border-neutral-800 rounded-xl
                          bg-neutral-50 dark:bg-neutral-900/50 font-sans text-sm text-neutral-700 dark:text-neutral-300
                          focus:outline-none resize-y"
                      />
                      <button
                        type="button"
                        onClick={copySnippet}
                        className="absolute top-3 right-3 p-2 rounded-lg bg-neutral-200 dark:bg-neutral-700
                          hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-600 dark:text-neutral-300
                          transition-colors"
                        title="Copy snippet"
                      >
                        {snippetCopied ? (
                          <CheckIcon className="w-4 h-4 text-green-600" />
                        ) : (
                          <svg className="w-4 h-4 text-neutral-500 dark:text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">
                    {canEdit && (
                      <Button type="submit" disabled={saving} isLoading={saving}>
                        Save Changes
                      </Button>
                    )}
                  </div>
                </form>
              </div>
            )}

            {activeTab === 'goals' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-1">Goals & Events</h2>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Define goals to label custom events (e.g. signup, purchase). Track with <code className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-xs">pulse.track(&apos;event_name&apos;)</code> in your snippet.
                  </p>
                </div>
                {goalsLoading ? (
                  <GoalsListSkeleton />
                ) : (
                  <>
                    {canEdit && (
                      <Button onClick={openAddGoal} variant="primary">
                        Add goal
                      </Button>
                    )}
                    <div className="space-y-2">
                      {goals.length === 0 ? (
                        <div className="p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 text-center text-neutral-500 dark:text-neutral-400 text-sm">
                          No goals yet. Add a goal to give custom events a display name in the dashboard.
                        </div>
                      ) : (
                        goals.map((goal) => (
                          <div
                            key={goal.id}
                            className="flex items-center justify-between py-3 px-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50"
                          >
                            <div>
                              <span className="font-medium text-neutral-900 dark:text-white">{goal.name}</span>
                              <span className="text-neutral-500 dark:text-neutral-400 text-sm ml-2">({goal.event_name})</span>
                            </div>
                            {canEdit && (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => openEditGoal(goal)}
                                  className="text-sm text-brand-orange hover:underline"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteGoal(goal)}
                                  className="text-sm text-red-600 dark:text-red-400 hover:underline"
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'reports' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-1">Scheduled Reports</h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">Automatically deliver analytics reports via email or webhooks.</p>
                  </div>
                  {canEdit && (
                    <Button onClick={() => { setEditingSchedule(null); resetReportForm(); setReportModalOpen(true) }}>
                      Add Report
                    </Button>
                  )}
                </div>

                {reportLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-20 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-800" />
                    ))}
                  </div>
                ) : reportSchedules.length === 0 ? (
                  <div className="p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 text-center text-neutral-500 dark:text-neutral-400 text-sm">
                    No scheduled reports yet. Add a report to automatically receive analytics summaries.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {reportSchedules.map((schedule) => (
                      <div
                        key={schedule.id}
                        className={`rounded-xl border p-4 transition-colors ${
                          schedule.enabled
                            ? 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50'
                            : 'border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/30 opacity-60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="p-2 bg-neutral-100 dark:bg-neutral-800 rounded-lg mt-0.5">
                              {schedule.channel === 'email' ? (
                                <Envelope className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
                              ) : (
                                <WebhooksLogo className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-neutral-900 dark:text-white">
                                  {getChannelLabel(schedule.channel)}
                                </span>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-orange/10 text-brand-orange">
                                  {getFrequencyLabel(schedule.frequency)}
                                </span>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                                  {getReportTypeLabel(schedule.report_type)}
                                </span>
                              </div>
                              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 truncate">
                                {schedule.channel === 'email'
                                  ? (schedule.channel_config as EmailConfig).recipients.join(', ')
                                  : (schedule.channel_config as WebhookConfig).url}
                              </p>
                              <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
                                {getScheduleDescription(schedule)}
                              </p>
                              <div className="flex items-center gap-3 mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                                <span>
                                  Last sent: {schedule.last_sent_at
                                    ? new Date(schedule.last_sent_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                                    : 'Never'}
                                </span>
                              </div>
                              {schedule.last_error && (
                                <p className="text-xs text-red-500 dark:text-red-400 mt-1">
                                  Error: {schedule.last_error}
                                </p>
                              )}
                            </div>
                          </div>

                          {canEdit && (
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => handleReportTest(schedule)}
                                disabled={reportTesting === schedule.id}
                                className="p-2 text-neutral-500 hover:text-brand-orange hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-50"
                                title="Send test report"
                              >
                                {reportTesting === schedule.id ? (
                                  <SpinnerGap className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Play className="w-4 h-4" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditSchedule(schedule)}
                                className="p-2 text-neutral-500 hover:text-brand-orange hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                                title="Edit schedule"
                              >
                                <PencilSimple className="w-4 h-4" />
                              </button>
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={schedule.enabled}
                                  onChange={() => handleReportToggle(schedule)}
                                  className="sr-only peer"
                                />
                                <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-orange/20 dark:peer-focus:ring-brand-orange/20 rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-neutral-600 peer-checked:bg-brand-orange"></div>
                              </label>
                              <button
                                type="button"
                                onClick={() => handleReportDelete(schedule)}
                                className="p-2 text-neutral-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                title="Delete schedule"
                              >
                                <Trash className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>

      <Modal
        isOpen={goalModalOpen}
        onClose={() => setGoalModalOpen(false)}
        title={editingGoal ? 'Edit goal' : 'Add goal'}
      >
        <form onSubmit={handleGoalSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Display name</label>
            <input
              type="text"
              value={goalForm.name}
              onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })}
              placeholder="e.g. Signups"
              autoFocus
              className="w-full px-4 py-2 border border-neutral-200 dark:border-neutral-800 rounded-lg bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Event name</label>
            <input
              type="text"
              value={goalForm.event_name}
              onChange={(e) => setGoalForm({ ...goalForm, event_name: e.target.value })}
              placeholder="e.g. signup_click (letters, numbers, underscores only)"
              maxLength={64}
              className="w-full px-4 py-2 border border-neutral-200 dark:border-neutral-800 rounded-lg bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white"
              required
            />
            <div className="flex justify-between mt-1">
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Letters, numbers, and underscores only. Spaces become underscores.</p>
              <span className={`text-xs tabular-nums ${goalForm.event_name.length > 56 ? 'text-amber-500' : 'text-neutral-400'}`}>{goalForm.event_name.length}/64</span>
            </div>
            {editingGoal && goalForm.event_name.trim().toLowerCase().replace(/\s+/g, '_') !== editingGoal.event_name && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">Changing event name does not reassign events already tracked under the previous name.</p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setGoalModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={goalSaving}>
              {goalSaving ? 'Saving…' : editingGoal ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        title={editingSchedule ? 'Edit report schedule' : 'Add report schedule'}
      >
        <form onSubmit={handleReportSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Channel</label>
            <div className="grid grid-cols-2 gap-2">
              {(['email', 'slack', 'discord', 'webhook'] as const).map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setReportForm({ ...reportForm, channel: ch })}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    reportForm.channel === ch
                      ? 'border-brand-orange bg-brand-orange/10 text-brand-orange'
                      : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                  }`}
                >
                  {ch === 'email' ? <Envelope className="w-4 h-4" /> : <WebhooksLogo className="w-4 h-4" />}
                  {getChannelLabel(ch)}
                </button>
              ))}
            </div>
          </div>

          {reportForm.channel === 'email' ? (
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Recipients</label>
              <input
                type="text"
                value={reportForm.recipients}
                onChange={(e) => setReportForm({ ...reportForm, recipients: e.target.value })}
                placeholder="email1@example.com, email2@example.com"
                className="w-full px-4 py-2 border border-neutral-200 dark:border-neutral-800 rounded-lg bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white"
                required
              />
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">Comma-separated email addresses.</p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                {reportForm.channel === 'slack' ? 'Slack Webhook URL' : reportForm.channel === 'discord' ? 'Discord Webhook URL' : 'Webhook URL'}
              </label>
              <input
                type="url"
                value={reportForm.webhookUrl}
                onChange={(e) => setReportForm({ ...reportForm, webhookUrl: e.target.value })}
                placeholder="https://hooks.example.com/..."
                className="w-full px-4 py-2 border border-neutral-200 dark:border-neutral-800 rounded-lg bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Frequency</label>
            <Select
              value={reportForm.frequency}
              onChange={(v) => setReportForm({ ...reportForm, frequency: v })}
              options={[
                { value: 'daily', label: 'Daily' },
                { value: 'weekly', label: 'Weekly' },
                { value: 'monthly', label: 'Monthly' },
              ]}
              variant="input"
              fullWidth
              align="left"
            />
          </div>

          {reportForm.frequency === 'weekly' && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Day of week</label>
              <Select
                value={String(reportForm.sendDay)}
                onChange={(v) => setReportForm({ ...reportForm, sendDay: parseInt(v) })}
                options={WEEKDAY_NAMES.map((name, i) => ({ value: String(i), label: name }))}
                variant="input"
                fullWidth
                align="left"
              />
            </div>
          )}

          {reportForm.frequency === 'monthly' && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Day of month</label>
              <Select
                value={String(reportForm.sendDay)}
                onChange={(v) => setReportForm({ ...reportForm, sendDay: parseInt(v) })}
                options={Array.from({ length: 28 }, (_, i) => {
                  const d = i + 1
                  const suffix = d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th'
                  return { value: String(d), label: `${d}${suffix}` }
                })}
                variant="input"
                fullWidth
                align="left"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Time</label>
            <Select
              value={String(reportForm.sendHour)}
              onChange={(v) => setReportForm({ ...reportForm, sendHour: parseInt(v) })}
              options={Array.from({ length: 24 }, (_, i) => ({
                value: String(i),
                label: formatHour(i),
              }))}
              variant="input"
              fullWidth
              align="left"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Timezone</label>
            <Select
              value={reportForm.timezone || 'UTC'}
              onChange={(v) => setReportForm({ ...reportForm, timezone: v })}
              options={TIMEZONES.map((tz) => ({ value: tz, label: tz }))}
              variant="input"
              fullWidth
              align="left"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Report Type</label>
            <Select
              value={reportForm.reportType}
              onChange={(v) => setReportForm({ ...reportForm, reportType: v })}
              options={[
                { value: 'summary', label: 'Summary' },
                { value: 'pages', label: 'Pages' },
                { value: 'sources', label: 'Sources' },
                { value: 'goals', label: 'Goals' },
              ]}
              variant="input"
              fullWidth
              align="left"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setReportModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={reportSaving}>
              {reportSaving ? 'Saving...' : editingSchedule ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>

      <VerificationModal
        isOpen={showVerificationModal}
        onClose={() => setShowVerificationModal(false)}
        site={site}
      />
    </div>
  )
}
