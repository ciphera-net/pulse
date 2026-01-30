'use client'

import { useState } from 'react'
import { Modal, Button, Checkbox, Input, Select } from '@ciphera-net/ui'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { DailyStat } from './Chart'
import { formatNumber, formatDuration } from '@/lib/utils/format'
import type { TopPage, TopReferrer } from '@/lib/api/stats'

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
  data: DailyStat[]
  stats?: {
    pageviews: number
    visitors: number
    bounce_rate: number
    avg_duration: number
  }
  topPages?: TopPage[]
  topReferrers?: TopReferrer[]
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

export default function ExportModal({ isOpen, onClose, data, stats, topPages, topReferrers }: ExportModalProps) {
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
      
      // Header Section
      try {
        // Logo
        const logoData = await loadImage('/pulse_icon_no_margins.png')
        doc.addImage(logoData, 'PNG', 14, 12, 12, 12) // x, y, w, h
        
        // Title
        doc.setFontSize(22)
        doc.setTextColor(249, 115, 22) // Brand Orange #F97316
        doc.text('Pulse', 32, 20)
        
        doc.setFontSize(12)
        doc.setTextColor(100, 100, 100)
        doc.text('Analytics Export', 32, 25)
      } catch (e) {
        // Fallback if logo fails
        doc.setFontSize(22)
        doc.setTextColor(249, 115, 22)
        doc.text('Pulse Analytics', 14, 20)
      }

      // Metadata (Top Right)
      doc.setFontSize(9)
      doc.setTextColor(150, 150, 150)
      const generatedDate = new Date().toLocaleDateString()
      const dateRange = data.length > 0 
        ? `${new Date(data[0].date).toLocaleDateString()} - ${new Date(data[data.length - 1].date).toLocaleDateString()}`
        : generatedDate
      
      const pageWidth = doc.internal.pageSize.width
      doc.text(`Generated: ${generatedDate}`, pageWidth - 14, 18, { align: 'right' })
      doc.text(`Range: ${dateRange}`, pageWidth - 14, 23, { align: 'right' })

      let startY = 35

      // Summary Section
      if (stats) {
        const summaryY = 35
        const cardWidth = (pageWidth - 28 - 15) / 4 // 4 cards with 5mm gap
        const cardHeight = 20
        
        const drawCard = (x: number, label: string, value: string) => {
            doc.setFillColor(255, 247, 237) // Very light orange
            doc.setDrawColor(254, 215, 170) // Light orange border
            doc.roundedRect(x, summaryY, cardWidth, cardHeight, 2, 2, 'FD')
            
            doc.setFontSize(8)
            doc.setTextColor(150, 150, 150)
            doc.text(label, x + 3, summaryY + 6)
            
            doc.setFontSize(12)
            doc.setTextColor(23, 23, 23) // Neutral 900
            doc.setFont('helvetica', 'bold')
            doc.text(value, x + 3, summaryY + 14)
            doc.setFont('helvetica', 'normal')
        }

        drawCard(14, 'Unique Visitors', formatNumber(stats.visitors))
        drawCard(14 + cardWidth + 5, 'Total Pageviews', formatNumber(stats.pageviews))
        drawCard(14 + (cardWidth + 5) * 2, 'Bounce Rate', `${Math.round(stats.bounce_rate)}%`)
        drawCard(14 + (cardWidth + 5) * 3, 'Avg Duration', formatDuration(stats.avg_duration))
        
        startY = 65 // Move table down
      }

      // Check if data is hourly (same date for multiple rows)
      const isHourly = data.length > 1 && data[0].date.split('T')[0] === data[1].date.split('T')[0]

      const tableData = exportData.map(row => 
        fields.map(field => {
          const val = row[field]
          if (field === 'date' && typeof val === 'string') {
            const date = new Date(val)
            return isHourly 
                ? date.toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
                : date.toLocaleDateString()
          }
          if (typeof val === 'number') {
             if (field === 'bounce_rate') return `${Math.round(val)}%`
             if (field === 'avg_duration') return formatDuration(val)
             if (field === 'pageviews' || field === 'visitors') return formatNumber(val)
          }
          return val ?? ''
        })
      )

      autoTable(doc, {
        startY: startY,
        head: [fields.map(f => f.charAt(0).toUpperCase() + f.slice(1).replace('_', ' '))],
        body: tableData as any[][],
        styles: {
            font: 'helvetica',
            fontSize: 9,
            cellPadding: 4,
            lineColor: [229, 231, 235], // Neutral 200
            lineWidth: 0.1,
        },
        headStyles: {
            fillColor: [249, 115, 22], // Brand Orange
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'left'
        },
        columnStyles: {
            0: { halign: 'left' }, // Date
            1: { halign: 'right' }, // Pageviews
            2: { halign: 'right' }, // Visitors
            3: { halign: 'right' }, // Bounce Rate
            4: { halign: 'right' }, // Avg Duration
        },
        alternateRowStyles: {
            fillColor: [255, 250, 245], // Very very light orange
        },
        didDrawPage: (data) => {
            // Footer
            const pageSize = doc.internal.pageSize
            const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight()
            doc.setFontSize(8)
            doc.setTextColor(150, 150, 150)
            doc.text('Powered by Ciphera', 14, pageHeight - 10)
            
            const str = 'Page ' + doc.getNumberOfPages()
            doc.text(str, pageSize.width - 14, pageHeight - 10, { align: 'right' })
        }
      })

      let finalY = (doc as any).lastAutoTable.finalY + 10

      // Top Pages Table
      if (topPages && topPages.length > 0) {
        // Check if we need a new page
        if (finalY + 40 > doc.internal.pageSize.height) {
            doc.addPage()
            finalY = 20
        }

        doc.setFontSize(14)
        doc.setTextColor(23, 23, 23)
        doc.text('Top Pages', 14, finalY)
        finalY += 5

        const pagesData = topPages.slice(0, 10).map(p => [p.path, formatNumber(p.pageviews)])
        
        autoTable(doc, {
            startY: finalY,
            head: [['Path', 'Pageviews']],
            body: pagesData,
            styles: { font: 'helvetica', fontSize: 9, cellPadding: 3 },
            headStyles: { fillColor: [249, 115, 22], textColor: [255, 255, 255], fontStyle: 'bold' },
            columnStyles: { 1: { halign: 'right' } },
            alternateRowStyles: { fillColor: [255, 250, 245] },
        })
        
        finalY = (doc as any).lastAutoTable.finalY + 10
      }

      // Top Referrers Table
      if (topReferrers && topReferrers.length > 0) {
         // Check if we need a new page
         if (finalY + 40 > doc.internal.pageSize.height) {
            doc.addPage()
            finalY = 20
        }

        doc.setFontSize(14)
        doc.setTextColor(23, 23, 23)
        doc.text('Top Referrers', 14, finalY)
        finalY += 5

        const referrersData = topReferrers.slice(0, 10).map(r => [r.referrer, formatNumber(r.pageviews)])
        
        autoTable(doc, {
            startY: finalY,
            head: [['Referrer', 'Pageviews']],
            body: referrersData,
            styles: { font: 'helvetica', fontSize: 9, cellPadding: 3 },
            headStyles: { fillColor: [249, 115, 22], textColor: [255, 255, 255], fontStyle: 'bold' },
            columnStyles: { 1: { halign: 'right' } },
            alternateRowStyles: { fillColor: [255, 250, 245] },
        })
      }

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
