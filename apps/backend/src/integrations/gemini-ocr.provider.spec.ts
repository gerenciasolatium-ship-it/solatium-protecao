import { ConfigService } from '@nestjs/config';
import { GeminiOcrProvider } from './gemini-ocr.provider';

function providerCom(env: Record<string, string>) {
  const config = { get: (chave: string) => env[chave] } as unknown as ConfigService;
  return new GeminiOcrProvider(config);
}

function respostaGemini(texto: string) {
  return {
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: texto }] } }] }),
  } as Response;
}

describe('GeminiOcrProvider (fetch mockado — nunca chama a API real)', () => {
  const fetchOriginal = global.fetch;
  afterEach(() => {
    global.fetch = fetchOriginal;
  });

  it('sem GEMINI_API_KEY → indisponível sem chamar a rede', async () => {
    const espiao = jest.fn();
    global.fetch = espiao as unknown as typeof fetch;
    const r = await providerCom({}).extrairImeis('Zm9v');
    expect(r).toEqual({ disponivel: false, imeis: [] });
    expect(espiao).not.toHaveBeenCalled();
  });

  it('lê os IMEIs da resposta do modelo (dual-SIM)', async () => {
    global.fetch = jest.fn(async () =>
      respostaGemini('350147160259436\n350147160259444'),
    ) as unknown as typeof fetch;
    const r = await providerCom({ GEMINI_API_KEY: 'k' }).extrairImeis('Zm9v');
    expect(r.disponivel).toBe(true);
    expect(r.imeis).toEqual(['350147160259436', '350147160259444']);
  });

  it('resposta VAZIO → disponível com lista vazia (inconclusivo pro chamador)', async () => {
    global.fetch = jest.fn(async () => respostaGemini('VAZIO')) as unknown as typeof fetch;
    const r = await providerCom({ GEMINI_API_KEY: 'k' }).extrairImeis('Zm9v');
    expect(r).toEqual({ disponivel: true, imeis: [] });
  });

  it('HTTP != 200 ou erro de rede → indisponível (nunca lança)', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 429 }) as Response) as never;
    await expect(providerCom({ GEMINI_API_KEY: 'k' }).extrairImeis('Zm9v')).resolves.toEqual({
      disponivel: false,
      imeis: [],
    });
    global.fetch = jest.fn(async () => {
      throw new Error('rede caiu');
    }) as unknown as typeof fetch;
    await expect(providerCom({ GEMINI_API_KEY: 'k' }).extrairImeis('Zm9v')).resolves.toEqual({
      disponivel: false,
      imeis: [],
    });
  });
});
