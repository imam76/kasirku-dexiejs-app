export const FEEDBACK_QUESTIONS = [
  {
    id: 1,
    question: 'Seberapa mudah Anda menyelesaikan transaksi pertama?',
    type: '1-5',
    dimension: 'Customer Effort Score (CES)',
  },
  {
    id: 2,
    question: 'Seberapa jelas informasi yang ditampilkan di layar utama?',
    type: '1-5',
    dimension: 'Cognitive Load / Clarity',
  },
  {
    id: 3,
    question: 'Apakah Anda pernah bingung mencari fitur tertentu?',
    type: 'Yes/No',
    dimension: 'Usability Friction (reverse-scored)',
  },
  {
    id: 4,
    question: 'Seberapa puas Anda dengan kecepatan respons aplikasi?',
    type: '1-5',
    dimension: 'Performance Satisfaction',
  },
  {
    id: 5,
    question: 'Apakah tampilan aplikasi membuat Anda merasa percaya mengelola penjualan?',
    type: 'Yes/No',
    dimension: 'Trust & Perceived Professionalism',
  },
  {
    id: 6,
    question: 'Apakah Anda merasa lebih efisien setelah menggunakan aplikasi ini?',
    type: 'Yes/No',
    dimension: 'Perceived Usefulness (TAM)',
  },
  {
    id: 7,
    question: 'Seberapa besar kemungkinan Anda merekomendasikan aplikasi ini ke rekan pedagang?',
    type: '1-5',
    dimension: 'Net Promoter Score (NPS)',
  },
  {
    id: 8,
    question: 'Apakah Anda berencana terus menggunakan aplikasi ini dalam 30 hari ke depan?',
    type: 'Yes/No',
    dimension: 'Behavioral Intention',
  },
  {
    id: 9,
    question: 'Apa alasan tidak melanjutkan?',
    type: 'Text',
    dimension: 'Voice of Customer',
  },
]

export type FeedbackQuestion = typeof FEEDBACK_QUESTIONS[number]