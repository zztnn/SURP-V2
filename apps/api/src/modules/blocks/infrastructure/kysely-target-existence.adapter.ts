import { Inject, Injectable } from '@nestjs/common';
import { type Kysely } from 'kysely';
import { DATABASE } from '../../../database/database.token';
import type { DB } from '../../../database/generated/database.types';
import type { TargetExistencePort } from '../ports/target-existence.port';

@Injectable()
export class KyselyTargetExistence implements TargetExistencePort {
  constructor(@Inject(DATABASE) private readonly db: Kysely<DB>) {}

  async existsParty(partyId: bigint): Promise<boolean> {
    const row = await this.db
      .selectFrom('parties')
      .select('id')
      .where('id', '=', partyId.toString())
      .where('deletedAt', 'is', null)
      // merged_into_party_id != null → el party está fusionado en otro;
      // no se pueden bloquear merged-out parties (su data ya migró).
      .where('mergedIntoPartyId', 'is', null)
      .executeTakeFirst();
    return row !== undefined;
  }

  async existsVehicle(vehicleId: bigint): Promise<boolean> {
    const row = await this.db
      .selectFrom('vehicles')
      .select('id')
      .where('id', '=', vehicleId.toString())
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    return row !== undefined;
  }
}
