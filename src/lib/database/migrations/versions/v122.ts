import type {
  Contact,
  CooperativeArea,
  CooperativeLoan,
  CooperativeLoanInstallment,
  CooperativeLoanPayment,
  CooperativeMemberCode,
  CooperativeMember,
  CooperativeMemberSavingBalance,
  CooperativeSavingTransaction,
  PurchaseDocument,
  PurchaseDocumentItem,
  SalesDocument,
  SalesDocumentItem,
} from '@/types';
import { normalizeStoredTimestamp } from '@/utils/timestamps';
import type { KasirkuDB } from '../../KasirkuDB';

type LegacyMembershipContact = Contact & { membership_joined_at?: string };

export function registerMigrationV122(db: KasirkuDB) {
  db.version(122).stores({}).upgrade(async (migration) => {
    await migration.table<LegacyMembershipContact>('contacts').toCollection().modify((contact) => {
      contact.created_at = normalizeStoredTimestamp(contact.created_at) ?? contact.created_at;
      contact.updated_at = normalizeStoredTimestamp(contact.updated_at) ?? contact.updated_at;
      contact.membership_joined_at = normalizeStoredTimestamp(contact.membership_joined_at);
      contact.last_synced_at = normalizeStoredTimestamp(contact.last_synced_at);
      contact.remote_updated_at = normalizeStoredTimestamp(contact.remote_updated_at);
    });

    await migration.table<SalesDocument>('salesDocuments').toCollection().modify((document) => {
      document.created_at = normalizeStoredTimestamp(document.created_at) ?? document.created_at;
      document.updated_at = normalizeStoredTimestamp(document.updated_at) ?? document.updated_at;
      document.issued_at = normalizeStoredTimestamp(document.issued_at);
      document.voided_at = normalizeStoredTimestamp(document.voided_at);
      document.last_synced_at = normalizeStoredTimestamp(document.last_synced_at);
      document.remote_updated_at = normalizeStoredTimestamp(document.remote_updated_at);
    });

    await migration.table<SalesDocumentItem>('salesDocumentItems').toCollection().modify((item) => {
      item.created_at = normalizeStoredTimestamp(item.created_at) ?? item.created_at;
      item.price_edited_at = normalizeStoredTimestamp(item.price_edited_at);
    });

    await migration.table<PurchaseDocument>('purchaseDocuments').toCollection().modify((document) => {
      document.created_at = normalizeStoredTimestamp(document.created_at) ?? document.created_at;
      document.updated_at = normalizeStoredTimestamp(document.updated_at) ?? document.updated_at;
      document.issued_at = normalizeStoredTimestamp(document.issued_at);
      document.voided_at = normalizeStoredTimestamp(document.voided_at);
      document.last_synced_at = normalizeStoredTimestamp(document.last_synced_at);
      document.remote_updated_at = normalizeStoredTimestamp(document.remote_updated_at);
    });

    await migration.table<PurchaseDocumentItem>('purchaseDocumentItems').toCollection().modify((item) => {
      item.created_at = normalizeStoredTimestamp(item.created_at) ?? item.created_at;
    });

    await migration.table<CooperativeArea>('cooperativeAreas').toCollection().modify((area) => {
      area.created_at = normalizeStoredTimestamp(area.created_at) ?? area.created_at;
      area.updated_at = normalizeStoredTimestamp(area.updated_at) ?? area.updated_at;
      area.last_synced_at = normalizeStoredTimestamp(area.last_synced_at);
      area.remote_updated_at = normalizeStoredTimestamp(area.remote_updated_at);
    });

    await migration.table<CooperativeMember>('cooperativeMembers').toCollection().modify((member) => {
      member.created_at = normalizeStoredTimestamp(member.created_at) ?? member.created_at;
      member.updated_at = normalizeStoredTimestamp(member.updated_at) ?? member.updated_at;
      member.last_synced_at = normalizeStoredTimestamp(member.last_synced_at);
      member.remote_updated_at = normalizeStoredTimestamp(member.remote_updated_at);
    });

    await migration.table<CooperativeMemberCode>('cooperativeMemberCodes').toCollection().modify((code) => {
      code.created_at = normalizeStoredTimestamp(code.created_at) ?? code.created_at;
      code.updated_at = normalizeStoredTimestamp(code.updated_at) ?? code.updated_at;
    });

    await migration.table<CooperativeSavingTransaction>('cooperativeSavingTransactions').toCollection().modify((transaction) => {
      transaction.created_at = normalizeStoredTimestamp(transaction.created_at) ?? transaction.created_at;
      transaction.updated_at = normalizeStoredTimestamp(transaction.updated_at) ?? transaction.updated_at;
      transaction.last_synced_at = normalizeStoredTimestamp(transaction.last_synced_at);
      transaction.remote_updated_at = normalizeStoredTimestamp(transaction.remote_updated_at);
    });

    await migration.table<CooperativeMemberSavingBalance>('cooperativeMemberSavingBalances').toCollection().modify((balance) => {
      balance.updated_at = normalizeStoredTimestamp(balance.updated_at) ?? balance.updated_at;
      balance.last_synced_at = normalizeStoredTimestamp(balance.last_synced_at);
      balance.remote_updated_at = normalizeStoredTimestamp(balance.remote_updated_at);
    });

    await migration.table<CooperativeLoan>('cooperativeLoans').toCollection().modify((loan) => {
      loan.created_at = normalizeStoredTimestamp(loan.created_at) ?? loan.created_at;
      loan.updated_at = normalizeStoredTimestamp(loan.updated_at) ?? loan.updated_at;
      loan.last_synced_at = normalizeStoredTimestamp(loan.last_synced_at);
      loan.remote_updated_at = normalizeStoredTimestamp(loan.remote_updated_at);
    });

    await migration.table<CooperativeLoanInstallment>('cooperativeLoanInstallments').toCollection().modify((installment) => {
      installment.created_at = normalizeStoredTimestamp(installment.created_at) ?? installment.created_at;
      installment.updated_at = normalizeStoredTimestamp(installment.updated_at) ?? installment.updated_at;
      installment.last_synced_at = normalizeStoredTimestamp(installment.last_synced_at);
      installment.remote_updated_at = normalizeStoredTimestamp(installment.remote_updated_at);
    });

    await migration.table<CooperativeLoanPayment>('cooperativeLoanPayments').toCollection().modify((payment) => {
      payment.created_at = normalizeStoredTimestamp(payment.created_at) ?? payment.created_at;
      payment.updated_at = normalizeStoredTimestamp(payment.updated_at) ?? payment.updated_at;
      payment.posted_at = normalizeStoredTimestamp(payment.posted_at);
      payment.last_synced_at = normalizeStoredTimestamp(payment.last_synced_at);
      payment.remote_updated_at = normalizeStoredTimestamp(payment.remote_updated_at);
    });
  });
}
