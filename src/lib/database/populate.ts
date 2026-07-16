import { buildSystemRolePermissions, buildSystemRoles } from '@/auth/roleSeed';
import { DEFAULT_CONVERSIONS, DEFAULT_UNITS } from '@/constants/units';
import { buildBaseCurrency, buildBaseCurrencyRate } from '@/constants/currencies';
import type { KasirkuDB } from './KasirkuDB';
import { buildAccountingSeed, buildDefaultCompanyProfileSetting, buildDefaultPaymentMethods } from './seeds';

export function registerDatabasePopulate(this: KasirkuDB) {
  this.on('populate', async () => {
    await this.units.bulkAdd(DEFAULT_UNITS);
    await this.unitConversions.bulkAdd(DEFAULT_CONVERSIONS);
    const now = new Date().toISOString();
    await this.currencies.put(buildBaseCurrency(now));
    await this.currencyRates.put(buildBaseCurrencyRate(now));
    const seed = buildAccountingSeed(now);
    await this.chartOfAccounts.bulkPut(seed.accounts);
    await this.paymentMethods.bulkPut(buildDefaultPaymentMethods(seed.accounts, now));
    await this.financeAccountMappings.bulkPut(seed.mappings);
    await this.accountingProfileSetting.put(seed.profileSetting);
    await this.enabledModules.bulkPut(seed.enabledModules);
    await this.generalLedgerSetting.put(seed.generalLedgerSetting);
    await this.cooperativeSettings.put({
      id: 'default',
      created_at: now,
      updated_at: now,
    });
    await this.companyProfileSetting.put(buildDefaultCompanyProfileSetting(now));
    await this.roles.bulkPut(buildSystemRoles(now));
    await this.rolePermissions.bulkPut(buildSystemRolePermissions(now));
  });
}
