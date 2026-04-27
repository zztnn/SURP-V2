import { NotFoundException } from '@nestjs/common';
import { Example } from '../domain/example';
import { EXAMPLE_REPOSITORY, type ExampleRepositoryPort } from '../ports/example.repository.port';
import { GetExampleByCodeUseCase } from './get-example-by-code.use-case';
import type { RequestContext } from '../../../common';

describe('GetExampleByCodeUseCase', () => {
  let useCase: GetExampleByCodeUseCase;
  let repoMock: jest.Mocked<ExampleRepositoryPort>;

  const ctx: RequestContext = {
    requestId: 'req-1',
    userId: 1n,
    organizationId: 1n,
    organizationType: 'principal',
    ip: null,
    userAgent: null,
    source: 'http',
    startedAt: new Date(),
    sessionExternalId: null,
  };

  beforeEach(() => {
    repoMock = {
      findByCode: jest.fn(),
      save: jest.fn(),
    };
    useCase = new GetExampleByCodeUseCase(repoMock);
  });

  it('retorna el example cuando existe', async () => {
    const example = new Example(1n, 'foo', 'Foo Example', true);
    repoMock.findByCode.mockResolvedValue(example);

    const result = await useCase.execute({ code: 'foo' }, ctx);

    expect(result).toBe(example);
    expect(repoMock.findByCode).toHaveBeenCalledWith('foo');
  });

  it('lanza NotFoundException cuando no existe', async () => {
    repoMock.findByCode.mockResolvedValue(null);

    await expect(useCase.execute({ code: 'bar' }, ctx)).rejects.toThrow(NotFoundException);
  });

  it('demuestra que el token EXAMPLE_REPOSITORY es el contrato de DI', () => {
    expect(typeof EXAMPLE_REPOSITORY).toBe('symbol');
    expect(EXAMPLE_REPOSITORY.toString()).toContain('EXAMPLE_REPOSITORY');
  });
});
