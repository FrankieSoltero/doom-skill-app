// The server-state cache and its helpers (src/api/query.ts). The app has no API client here
// (the test configuration names the demo sets).
import { signOut } from '../../auth/useSession';
import { ApiError } from '../errors';
import { asApiError, createQueryClient, queryClient, requireApi } from '../query';

describe('the query cache', () => {
  it('retries neither queries nor mutations: the API client owns retries', () => {
    const { queries, mutations } = createQueryClient().getDefaultOptions();

    expect(queries?.retry).toBe(false);
    expect(mutations?.retry).toBe(false);
  });

  it("is cleared when a user's data must go", async () => {
    queryClient.setQueryData(['me'], { display_name: 'Owner' });

    await signOut();

    expect(queryClient.getQueryData(['me'])).toBeUndefined();
  });
});

describe('requireApi', () => {
  it('throws when the app has no API client', () => {
    expect(() => requireApi()).toThrow('The app has no API client');
  });
});

describe('asApiError', () => {
  it('passes an ApiError through, reads anything else as a server fault, and nothing as none', () => {
    const notFound = new ApiError('notFound', 404);

    expect(asApiError(notFound)).toBe(notFound);
    expect(asApiError(new TypeError('bad json'))).toStrictEqual(new ApiError('server', 0));
    expect(asApiError(null)).toBeUndefined();
    expect(asApiError(undefined)).toBeUndefined();
  });
});
