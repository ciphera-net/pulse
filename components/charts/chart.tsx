'use client'

import * as React from 'react'
import { Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { cn } from '@ciphera-net/ui'

// ─── ChartConfig ────────────────────────────────────────────────────

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode
    icon?: React.ComponentType
    color?: string
    theme?: { light: string; dark: string }
  }
>

// ─── ChartContext ───────────────────────────────────────────────────

type ChartContextProps = {
  config: ChartConfig
}

const ChartContext = React.createContext<ChartContextProps | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)
  if (!context) {
    throw new Error('useChart must be used within a <ChartContainer />')
  }
  return context
}

// ─── ChartContainer ────────────────────────────────────────────────

const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & {
    config: ChartConfig
    children: React.ComponentProps<typeof ResponsiveContainer>['children']
  }
>(({ id, className, children, config, ...props }, ref) => {
  const uniqueId = React.useId()
  const chartId = `chart-${id || uniqueId.replace(/:/g, '')}`

  // Build CSS variables from config
  const colorVars = React.useMemo(() => {
    const vars: Record<string, string> = {}
    for (const [key, value] of Object.entries(config)) {
      if (value.color) {
        vars[`--color-${key}`] = value.color
      }
    }
    return vars
  }, [config])

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        ref={ref}
        className={cn(
          "[&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-[var(--chart-grid)]",
          "[&_.recharts-curve.recharts-tooltip-cursor]:stroke-[var(--chart-grid)]",
          "[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-[var(--chart-grid)]",
          "[&_.recharts-reference-line_[stroke='#ccc']]:stroke-[var(--chart-grid)]",
          '[&_.recharts-sector]:outline-none',
          '[&_.recharts-surface]:outline-none',
          className,
        )}
        style={colorVars as React.CSSProperties}
        {...props}
      >
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
})
ChartContainer.displayName = 'ChartContainer'

// ─── ChartTooltip ──────────────────────────────────────────────────

const ChartTooltip = Tooltip

// ─── ChartTooltipContent ───────────────────────────────────────────

const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof Tooltip> &
    React.ComponentProps<'div'> & {
      hideLabel?: boolean
      hideIndicator?: boolean
      indicator?: 'line' | 'dot' | 'dashed'
      nameKey?: string
      labelKey?: string
      labelFormatter?: (value: string, payload: Record<string, unknown>[]) => React.ReactNode
    }
>(
  (
    {
      active,
      payload,
      className,
      indicator = 'dot',
      hideLabel = false,
      hideIndicator = false,
      label,
      labelFormatter,
      labelKey,
      nameKey,
    },
    ref,
  ) => {
    const { config } = useChart()

    const tooltipLabel = React.useMemo(() => {
      if (hideLabel || !payload?.length) return null

      const item = payload[0]
      const key = `${labelKey || item?.dataKey || item?.name || 'value'}`
      const itemConfig = getPayloadConfigFromPayload(config, item, key)
      const value =
        !labelKey && typeof label === 'string'
          ? config[label as keyof typeof config]?.label || label
          : itemConfig?.label

      if (labelFormatter) {
        return labelFormatter(
          value as string,
          payload as Record<string, unknown>[],
        )
      }

      return value
    }, [label, labelFormatter, payload, hideLabel, config, labelKey])

    if (!active || !payload?.length) return null

    const nestLabel = payload.length === 1 && indicator !== 'dot'

    return (
      <div
        ref={ref}
        className={cn(
          'grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-xs shadow-xl',
          className,
        )}
      >
        {!nestLabel ? tooltipLabel ? (
          <div className="font-medium text-neutral-50">
            {tooltipLabel}
          </div>
        ) : null : null}
        <div className="grid gap-1.5">
          {payload.map((item, index) => {
            const key = `${nameKey || item.name || item.dataKey || 'value'}`
            const itemConfig = getPayloadConfigFromPayload(config, item, key)
            const indicatorColor = item.fill || item.color

            return (
              <div
                key={item.dataKey || index}
                className={cn(
                  'flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground',
                  indicator === 'dot' && 'items-center',
                )}
              >
                {itemConfig?.icon ? (
                  <itemConfig.icon />
                ) : (
                  !hideIndicator && (
                    <div
                      className={cn(
                        'shrink-0 rounded-[2px] border-[var(--color-border)] bg-[var(--color-bg)]',
                        indicator === 'dot' && 'h-2.5 w-2.5 rounded-full',
                        indicator === 'line' && 'w-1',
                        indicator === 'dashed' &&
                          'w-0 border-[1.5px] border-dashed bg-transparent',
                        nestLabel && indicator === 'dashed'
                          ? 'my-0.5'
                          : 'my-0.5',
                      )}
                      style={
                        {
                          '--color-bg': indicatorColor,
                          '--color-border': indicatorColor,
                        } as React.CSSProperties
                      }
                    />
                  )
                )}
                <div
                  className={cn(
                    'flex flex-1 justify-between leading-none',
                    nestLabel ? 'items-end' : 'items-center',
                  )}
                >
                  <div className="grid gap-1.5">
                    {nestLabel ? tooltipLabel : null}
                    <span className="text-muted-foreground">
                      {itemConfig?.label || item.name}
                    </span>
                  </div>
                  {item.value != null && (
                    <span className="font-mono font-medium tabular-nums text-neutral-50">
                      {typeof item.value === 'number'
                        ? item.value.toLocaleString()
                        : item.value}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  },
)
ChartTooltipContent.displayName = 'ChartTooltipContent'

// ─── ChartLegend ───────────────────────────────────────────────────

const ChartLegend = Legend

const ChartLegendContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> &
    Pick<React.ComponentProps<typeof Legend>, 'payload' | 'verticalAlign'> & {
      hideIcon?: boolean
      nameKey?: string
    }
>(
  (
    { className, hideIcon = false, payload, verticalAlign = 'bottom', nameKey },
    ref,
  ) => {
    const { config } = useChart()

    if (!payload?.length) return null

    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center justify-center gap-4',
          verticalAlign === 'top' ? 'pb-3' : 'pt-3',
          className,
        )}
      >
        {payload.map((item) => {
          const key = `${nameKey || item.dataKey || 'value'}`
          const itemConfig = getPayloadConfigFromPayload(config, item, key)

          return (
            <div
              key={item.value}
              className="flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground"
            >
              {itemConfig?.icon && !hideIcon ? (
                <itemConfig.icon />
              ) : (
                <div
                  className="h-2 w-2 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: item.color }}
                />
              )}
              <span className="text-xs text-muted-foreground">
                {itemConfig?.label}
              </span>
            </div>
          )
        })}
      </div>
    )
  },
)
ChartLegendContent.displayName = 'ChartLegendContent'

// ─── Helpers ───────────────────────────────────────────────────────

function getPayloadConfigFromPayload(
  config: ChartConfig,
  payload: unknown,
  key: string,
) {
  if (typeof payload !== 'object' || payload === null) return undefined

  const payloadPayload =
    'payload' in payload &&
    typeof (payload as Record<string, unknown>).payload === 'object' &&
    (payload as Record<string, unknown>).payload !== null
      ? ((payload as Record<string, unknown>).payload as Record<string, unknown>)
      : undefined

  let configLabelKey = key

  if (
    key in config
  ) {
    configLabelKey = key
  } else if (payloadPayload) {
    const payloadKey = Object.keys(payloadPayload).find(
      (k) => payloadPayload[k] === key && k in config,
    )
    if (payloadKey) configLabelKey = payloadKey
  }

  return configLabelKey in config ? config[configLabelKey] : config[key]
}

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartContext,
  useChart,
}
