'use client'

import { useState } from 'react'
import { Modal, Button, Checkbox, Input, Select } from '@ciphera-net/ui'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { DailyStat } from './Chart'

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
  data: DailyStat[]
}

type ExportFormat = 'csv' | 'json' | 'xlsx' | 'pdf'

const loadImage = (src: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'Anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject('Could not get canvas context')
      ctx.drawImage(img, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = src
  })
}

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

  const handleExport = async () => {
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
    } else if (format === 'pdf') {
      const doc = new jsPDF()
      
      // Add Logo
      try {
        const logoData = await loadImage('/pulse_logo_no_margins.png')
        doc.addImage(logoData, 'PNG', 14, 10, 10, 10) // x, y, w, h
        doc.setFontSize(20)
        doc.setTextColor(249, 115, 22) // Brand Orange #F97316
        doc.text('Pulse', 28, 17)
        
        doc.setFontSize(12)
        doc.setTextColor(100, 100, 100)
        doc.text('Analytics Export', 28, 22)
      } catch (e) {
        // Fallback if logo fails
        doc.setFontSize(20)
        doc.setTextColor(249, 115, 22)
        doc.text('Pulse Analytics', 14, 20)
      }

      // Add Date Range info if available
      doc.setFontSize(10)
      doc.setTextColor(150, 150, 150)
      doc.text(`Generated on ${new Date().toLocaleDateString()}`, 14, 30)

      const tableData = exportData.map(row => 
        fields.map(field => {
          const val = row[field]
          if (field === 'date' && typeof val === 'string') {
            return new Date(val).toLocaleDateString()
          }
          return val ?? ''
        })
      )

      autoTable(doc, {
        startY: 35,
        head: [fields.map(f => f.charAt(0).toUpperCase() + f.slice(1).replace('_', ' '))],
        body: tableData as any[][],
        styles: {
            font: 'helvetica',
            fontSize: 10,
            cellPadding: 3,
        },
        headStyles: {
            fillColor: [249, 115, 22], // Brand Orange
            textColor: [255, 255, 255],
            fontStyle: 'bold',
        },
        alternateRowStyles: {
            fillColor: [255, 247, 237], // Very light orange/gray
        },
        didDrawPage: (data) => {
            // Footer
            const pageSize = doc.internal.pageSize
            const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight()
            doc.setFontSize(8)
            doc.setTextColor(150, 150, 150)
            doc.text('Powered by Ciphera', 14, pageHeight - 10)
            
            const str = 'Page ' + doc.getNumberOfPages()
            doc.text(str, pageSize.width - 25, pageHeight - 10)
        }
      })

      doc.save(`${filename || 'export'}.pdf`)
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
                { value: 'pdf', label: 'PDF' },
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
