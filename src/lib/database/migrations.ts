import type { KasirkuDB } from './KasirkuDB';
import { registerMigrationsV001ToV020 } from './migrations/versions/v001-v020';
import { registerMigrationsV021ToV040 } from './migrations/versions/v021-v040';
import { registerMigrationsV041ToV060 } from './migrations/versions/v041-v060';
import { registerMigrationsV061ToV080 } from './migrations/versions/v061-v080';
import { registerMigrationsV081ToV098 } from './migrations/versions/v081-v098';
import { registerMigrationV099 } from './migrations/versions/v099';
import { registerMigrationV100 } from './migrations/versions/v100';
import { registerMigrationV101 } from './migrations/versions/v101';
import { registerMigrationV102 } from './migrations/versions/v102';
import { registerMigrationV103 } from './migrations/versions/v103';
import { registerMigrationV104 } from './migrations/versions/v104';
import { registerMigrationV105 } from './migrations/versions/v105';
import { registerMigrationV106 } from './migrations/versions/v106';
import { registerMigrationV107 } from './migrations/versions/v107';
import { registerMigrationV108 } from './migrations/versions/v108';

export function registerDatabaseMigrations(this: KasirkuDB) {
  registerMigrationsV001ToV020(this);
  registerMigrationsV021ToV040(this);
  registerMigrationsV041ToV060(this);
  registerMigrationsV061ToV080(this);
  registerMigrationsV081ToV098(this);
  registerMigrationV099(this);
  registerMigrationV100(this);
  registerMigrationV101(this);
  registerMigrationV102(this);
  registerMigrationV103(this);
  registerMigrationV104(this);
  registerMigrationV105(this);
  registerMigrationV106(this);
  registerMigrationV107(this);
  registerMigrationV108(this);
}
