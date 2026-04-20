export interface FeedbackQuestion {
  id: number
  question: string
  type: '1-5' | 'Yes/No' | 'Text'
  dimension: string
  wave: 1 | 2
}

export const FEEDBACK_QUESTIONS: FeedbackQuestion[] = [
  // Wave 1: Post-First Transaction (CES)
  {
    id: 1,
    question: 'Seberapa mudah Anda menyelesaikan transaksi pertama?',
    type: '1-5',
    dimension: 'Customer Effort Score (CES)',
    wave: 1,
  },
  // Wave 2: Mature Usage (TAM + NPS + Intention)
  {
    id: 2,
    question: 'Seberapa jelas informasi yang ditampilkan di layar utama?',
    type: '1-5',
    dimension: 'Cognitive Load / Clarity',
    wave: 2,
  },
  {
    id: 3,
    question: 'Apakah Anda pernah bingung mencari fitur tertentu?',
    type: 'Yes/No',
    dimension: 'Usability Friction',
    wave: 2,
  },
  {
    id: 4,
    question: 'Seberapa puas Anda dengan kecepatan respons aplikasi?',
    type: '1-5',
    dimension: 'Performance Satisfaction',
    wave: 2,
  },
  {
    id: 5,
    question: 'Apakah tampilan aplikasi membuat Anda merasa percaya mengelola penjualan?',
    type: 'Yes/No',
    dimension: 'Trust & Perceived Professionalism',
    wave: 2,
  },
  {
    id: 6,
    question: 'Apakah Anda merasa lebih efisien setelah menggunakan aplikasi ini?',
    type: 'Yes/No',
    dimension: 'Perceived Usefulness (TAM)',
    wave: 2,
  },
  {
    id: 7,
    question: 'Seberapa besar kemungkinan Anda merekomendasikan aplikasi ini ke rekan pedagang?',
    type: '1-5',
    dimension: 'Net Promoter Score (NPS)',
    wave: 2,
  },
  {
    id: 8,
    question: 'Apakah Anda berencana terus menggunakan aplikasi ini dalam 30 hari ke depan?',
    type: 'Yes/No',
    dimension: 'Behavioral Intention',
    wave: 2,
  },
  {
    id: 9,
    question: 'Apa alasan tidak melanjutkan?',
    type: 'Text',
    dimension: 'Voice of Customer',
    wave: 2,
  },
]
