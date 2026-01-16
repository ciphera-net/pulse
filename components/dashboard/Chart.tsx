'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface ChartProps {
  data: Array<{ date: string; pageviews: number; visitors: number }>
}

export default function Chart({ data }: ChartProps) {
  const chartData = data.map(item => ({
    date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    pageviews: item.pageviews,
    visitors: item.visitors,
  }))

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold mb-4 text-neutral-900 dark:text-white">
        Pageviews Over Time
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
          <XAxis dataKey="date" stroke="#737373" />
          <YAxis stroke="#737373" />
          <Tooltip
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e5e5e5',
              borderRadius: '8px',
            }}
          />
          <Line
            type="monotone"
            dataKey="pageviews"
            stroke="#FD5E0F"
            strokeWidth={2}
            dot={{ fill: '#FD5E0F' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
