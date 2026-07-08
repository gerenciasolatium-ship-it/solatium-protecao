import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { CreatePropostaExternaDto } from './dto/create-proposta-externa.dto';
import { ParceirosApiService } from './parceiros-api.service';

/**
 * API pública de parceiros (M11): o CRM do parceiro autentica com a chave da
 * loja (header x-api-key) e cria propostas pré-preenchidas; o retorno inclui
 * o link que abre o wizard Nova Proteção com os dados do cliente já na tela.
 */
@ApiTags('integracao-parceiros')
@ApiHeader({ name: 'x-api-key', description: 'Chave de API da loja (psk_...).' })
@Controller('integracao/propostas')
export class IntegracaoController {
  constructor(private readonly service: ParceirosApiService) {}

  @Public()
  @Post()
  @ApiOperation({ summary: 'Cria proposta com dados do CRM e devolve link pré-preenchido.' })
  async criar(@Body() dto: CreatePropostaExternaDto, @Headers('x-api-key') apiKey?: string) {
    const chave = await this.service.autenticarChave(apiKey);
    return this.service.criarProposta(chave, dto);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Consulta status da proposta (aberta/utilizada/concluída).' })
  async consultar(@Param('id') id: string, @Headers('x-api-key') apiKey?: string) {
    const chave = await this.service.autenticarChave(apiKey);
    return this.service.consultarProposta(chave, id);
  }
}
