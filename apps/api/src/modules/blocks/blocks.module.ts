import { Module } from '@nestjs/common';
import { CommonModule } from '../../common';
import { DatabaseModule } from '../../database/database.module';
import { BlocksController } from './blocks.controller';
import { KyselyBlockRepository } from './infrastructure/kysely-block.repository';
import { KyselyTargetExistence } from './infrastructure/kysely-target-existence.adapter';
import { BLOCK_REPOSITORY } from './ports/block.repository.port';
import { TARGET_EXISTENCE } from './ports/target-existence.port';
import { GetBlockByIdUseCase } from './use-cases/get-block-by-id.use-case';
import { GrantBlockUseCase } from './use-cases/grant-block.use-case';
import { ListBlocksUseCase } from './use-cases/list-blocks.use-case';
import { RevokeBlockUseCase } from './use-cases/revoke-block.use-case';

@Module({
  imports: [CommonModule, DatabaseModule],
  controllers: [BlocksController],
  providers: [
    GrantBlockUseCase,
    RevokeBlockUseCase,
    GetBlockByIdUseCase,
    ListBlocksUseCase,
    { provide: BLOCK_REPOSITORY, useClass: KyselyBlockRepository },
    { provide: TARGET_EXISTENCE, useClass: KyselyTargetExistence },
    // CLOCK viene del CommonModule (registrado en common.module.ts).
  ],
})
export class BlocksModule {}
