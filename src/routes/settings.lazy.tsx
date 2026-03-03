import { createLazyFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { App, Card, Button, Upload, Typography, Alert } from 'antd'
import { Download, Upload as UploadIcon, Database, AlertTriangle } from 'lucide-react'
import { backupDatabase, restoreDatabase } from '@/utils/backupRestore'
import { useNavigate } from '@tanstack/react-router'

const { Paragraph } = Typography

export const Route = createLazyFileRoute('/settings')({
  component: Settings,
})

function Settings() {
  const { message, modal } = App.useApp()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  const handleBackup = async () => {
    try {
      setLoading(true)
      await backupDatabase()
      message.success('Backup database berhasil diunduh')
    } catch (error) {
      console.error(error)
      message.error('Gagal melakukan backup database')
    } finally {
      setLoading(false)
    }
  }

  const handleRestore = async (file: File) => {
    modal.confirm({
      title: 'Konfirmasi Restore Database',
      icon: <AlertTriangle className="text-red-500 w-6 h-6 mr-2" />,
      content: (
        <div className="space-y-2">
          <p>Apakah Anda yakin ingin mengembalikan database dari file ini?</p>
          <Alert
            message="Peringatan"
            description="Tindakan ini akan menghapus semua data saat ini dan menggantinya dengan data dari file backup. Tindakan ini tidak dapat dibatalkan."
            type="warning"
            showIcon
            className="mt-2"
          />
        </div>
      ),
      okText: 'Ya, Restore',
      okType: 'danger',
      cancelText: 'Batal',
      onOk: async () => {
        try {
          setLoading(true)
          await restoreDatabase(file)
          message.success('Database berhasil dipulihkan')
          // Optional: Reload page to ensure all states are refreshed
          setTimeout(() => {
            window.location.reload()
          }, 1500)
        } catch (error) {
          console.error(error)
          message.error('Gagal memulihkan database. Pastikan file valid.')
        } finally {
          setLoading(false)
        }
      },
    })
    return false // Prevent auto upload
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Database className="w-8 h-8 text-blue-600" />
          Pengaturan Database
        </h1>
        <p className="text-gray-500 mt-2">
          Kelola backup dan restore data aplikasi Anda
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Backup Section */}
        <Card 
          title={<div className="flex items-center gap-2"><Download className="w-5 h-5" /> Backup Data</div>}
          className="shadow-md hover:shadow-lg transition-shadow"
        >
          <div className="space-y-4">
            <Paragraph className="text-gray-600">
              Unduh salinan lengkap database Anda saat ini. File backup akan disimpan dalam format JSON yang dapat digunakan untuk pemulihan di kemudian hari.
            </Paragraph>
            <Button 
              type="primary" 
              icon={<Download className="w-4 h-4" />} 
              onClick={handleBackup}
              loading={loading}
              size="large"
              block
            >
              Download Backup
            </Button>
          </div>
        </Card>

        {/* Restore Section */}
        <Card 
          title={<div className="flex items-center gap-2"><UploadIcon className="w-5 h-5" /> Restore Data</div>}
          className="shadow-md hover:shadow-lg transition-shadow"
        >
          <div className="space-y-4">
            <Paragraph className="text-gray-600">
              Pulihkan data dari file backup sebelumnya.
              <span className="font-bold text-red-500 block mt-1">
                Perhatian: Data saat ini akan ditimpa!
              </span>
            </Paragraph>
            <Upload
              beforeUpload={handleRestore}
              showUploadList={false}
              accept=".json"
              customRequest={() => {}} // Dummy to prevent auto request
            >
              <Button 
                icon={<UploadIcon className="w-4 h-4" />} 
                loading={loading}
                size="large"
                danger
                block
              >
                Upload File Backup
              </Button>
            </Upload>
          </div>
        </Card>
      </div>
      
      <div className="mt-8 text-center">
        <Button onClick={() => navigate({ to: '/' })} type="text">
          Kembali ke Dashboard
        </Button>
      </div>
    </div>
  )
}
