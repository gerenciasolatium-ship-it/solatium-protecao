import { Module } from '@nestjs/common';
import { ChavesApiController } from './chaves-api.controller';
import { IntegracaoController } from './integracao.controller';
import { PropostasExternasController } from './propostas-externas.controller';
import { ParceirosApiService } from './parceiros-api.service';

@Module({
  controllers: [IntegracaoController, ChavesApiController, PropostasExternasController],
  providers: [ParceirosApiService],
  exports: [ParceirosApiService],
})
export class ParceirosApiModule {}
