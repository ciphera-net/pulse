'use client'

import { useState } from 'react'
import { Modal, Button, Checkbox, Input, Select } from '@ciphera-net/ui'
import * as XLSX from 'xlsx'
import type { DailyStat } from './Chart'

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
  data: DailyStat[]
}

type ExportFormat = 'csv' | 'json' | 'xlsx'

export default function ExportModal({ isOpen, onClose, data }: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>('csv')
  const [filename, setFilename] = useState(`pulse_export_${new Date().toISOString().split('T')[0]}`)
  const [includeHeader, setIncludeHeader] = useState(true)
  const [selectedFields, setSelectedFields] = useState<Record<keyof DailyStat, boolean>>({
    date: true,
    pageviews: true,
    visitors: true,
    bounce_rate: true,
    avg_duration: true,
  })

  const handleFieldChange = (field: keyof DailyStat, checked: boolean) => {
    setSelectedFields((prev) => ({ ...prev, [field]: checked }))
  }

  const handleExport = () => {
    // Filter fields
    const fields = (Object.keys(selectedFields) as Array<keyof DailyStat>).filter((k) => selectedFields[k])
    
    // Prepare data
    const exportData = data.map((item) => {
      const filteredItem: Partial<DailyStat> = {}
      fields.forEach((field) => {
        (filteredItem as any)[field] = item[field]
      })
      return filteredItem
    })

    let content = ''
    let mimeType = ''
    let extension = ''

    if (format === 'csv') {
      const header = fields.join(',')
      const rows = exportData.map((row) =>
        fields.map((field) => {
            const val = row[field]
            if (field === 'date' && typeof val === 'string') {
                 return new Date(val).toISOString()
            }
            return val
        }).join(',')
      )
      content = (includeHeader ? header + '\n' : '') + rows.join('\n')
      mimeType = 'text/csv;charset=utf-8;'
      extension = 'csv'
    } else if (format === 'xlsx') {
      const ws = XLSX.utils.json_to_sheet(exportData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "Data")
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([wbout], { type: 'application/octet-stream' })
      
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.setAttribute('href', url)
      link.setAttribute('download', `${filename || 'export'}.${extension || 'xlsx'}`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      onClose()
      return
    } else {
      content = JSON.stringify(exportData, null, 2)
      mimeType = 'application/json;charset=utf-8;'
      extension = 'json'
    }

    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `${filename || 'export'}.${extension}`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export Data">
      <div className="space-y-6">
        {/* Filename & Format */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="filename" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Filename
            </label>
            <Input
              id="filename"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="filename"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="format" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Format
            </label>
            <Select
              id="format"
              value={format}
              onChange={(val) => setFormat(val as ExportFormat)}
              options={[
                { value: 'csv', label: 'CSV' },
                { value: 'json', label: 'JSON' },
                { value: 'xlsx', label: 'Excel' },
              ]}
              variant="input"
              fullWidth
            />
          </div>
        </div>

        {/* Fields Selection */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Include Fields
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Checkbox
              checked={selectedFields.date}
              onCheckedChange={(c) => handleFieldChange('date', c)}
              label="Date"
            />
            <Checkbox
              checked={selectedFields.pageviews}
              onCheckedChange={(c) => handleFieldChange('pageviews', c)}
              label="Pageviews"
            />
            <Checkbox
              checked={selectedFields.visitors}
              onCheckedChange={(c) => handleFieldChange('visitors', c)}
              label="Visitors"
            />
            <Checkbox
              checked={selectedFields.bounce_rate}
              onCheckedChange={(c) => handleFieldChange('bounce_rate', c)}
              label="Bounce Rate"
            />
            <Checkbox
              checked={selectedFields.avg_duration}
              onCheckedChange={(c) => handleFieldChange('avg_duration', c)}
              label="Avg Duration"
            />
          </div>
        </div>

        {/* Additional Options */}
        {format === 'csv' && (
          <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800">
             <Checkbox
              checked={includeHeader}
              onCheckedChange={setIncludeHeader}
              label="Include Header Row"
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleExport}>
            Export Data
          </Button>
        </div>
      </div>
    </Modal>
  )
}
