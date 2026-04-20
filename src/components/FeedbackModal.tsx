import { FEEDBACK_QUESTIONS } from '@/constants/feedback'
import { Button, Divider, Form, Input, Modal, Radio, Typography } from 'antd'
import React from 'react'

const { Text, Title } = Typography
const { TextArea } = Input

interface FeedbackModalProps {
  open: boolean
  onFinish: (values: any) => void
}

const FeedbackModal: React.FC<FeedbackModalProps> = ({ open, onFinish }) => {
  const [form] = Form.useForm()
  const q8Value = Form.useWatch('q8', form)

  const handleSubmit = (values: any) => {
    onFinish(values)
  }

  return (
    <Modal
      title={null}
      open={open}
      closable={false}
      maskClosable={false}
      footer={null}
      centered
      className="feedback-modal responsive-modal"
      width="100%"
      style={{ maxWidth: '600px', padding: '10px' }}
    >
      <div className="py-2 md:py-4">
        <Title level={4} className="text-center mb-1 md:mb-2 text-lg md:text-xl">
          Feedback Penggunaan Aplikasi
        </Title>
        <Text type="secondary" className="block text-center mb-4 md:mb-6 text-xs md:text-sm">
          Bantu kami meningkatkan kualitas aplikasi dengan mengisi kuesioner singkat ini.
        </Text>
        <Divider className="my-3 md:my-4" />

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          requiredMark={false}
          className="max-h-[70vh] overflow-y-auto px-1"
        >
          {FEEDBACK_QUESTIONS.map((q) => {
            // Logic to hide q9 if q8 is not 'No'
            if (q.id === 9 && q8Value !== 'No') {
              return null
            }

            return (
              <Form.Item
                key={q.id}
                name={`q${q.id}`}
                className="mb-4 md:mb-6"
                label={
                  <div className="flex flex-col">
                    <Text strong className="text-sm md:text-base leading-tight mb-1">{`${q.id}. ${q.question}`}</Text>
                    {/* <Text type="secondary" style={{ fontSize: '10px' }} className="uppercase tracking-wider opacity-70">
                      {q.dimension}
                    </Text> */}
                  </div>
                }
                rules={[{ required: true, message: 'Harap isi jawaban Anda' }]}
              >
                {q.type === '1-5' ? (
                  <Radio.Group optionType="button" buttonStyle="solid" className="w-full flex justify-between sm:justify-start gap-1 md:gap-2">
                    {[1, 2, 3, 4, 5].map((val) => (
                      <Radio.Button key={val} value={val} className="flex-1 sm:flex-none sm:w-12 text-center h-10 flex items-center justify-center rounded-md">
                        {val}
                      </Radio.Button>
                    ))}
                  </Radio.Group>
                ) : q.type === 'Text' ? (
                  <TextArea rows={4} placeholder="Tuliskan alasan Anda di sini..." className="rounded-md" />
                ) : (
                  <Radio.Group optionType="button" buttonStyle="solid" className="w-full flex gap-2">
                    <Radio.Button value="Yes" className="flex-1 sm:flex-none sm:w-24 text-center h-10 flex items-center justify-center rounded-md">
                      Ya
                    </Radio.Button>
                    <Radio.Button value="No" className="flex-1 sm:flex-none sm:w-24 text-center h-10 flex items-center justify-center rounded-md">
                      Tidak
                    </Radio.Button>
                  </Radio.Group>
                )}
              </Form.Item>
            )
          })}

          <div className="mt-6 md:mt-8 flex justify-center sticky bottom-0 bg-white py-2">
            <Button type="primary" size="large" htmlType="submit" className="w-full md:max-w-xs h-12 text-base font-semibold">
              Kirim Feedback
            </Button>
          </div>
        </Form>
      </div>
    </Modal>
  )
}

export default FeedbackModal
