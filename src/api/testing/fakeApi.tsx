// Test support: the app's real API client over a fake network that answers by route, put in
// place of the app's `api` for one test, and a fresh query cache to render with. Nothing leaves
// the test. Not app code.
import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import * as clientModule from '../client';
import { createQueryClient } from '../query';

/** What a route answers: a response, a network failure, or a promise of either. */
export type Answer = Response | Error | Promise<Response>;

/** One request the fake network was sent. */
type SentRequest = { method: string; path: string; query: string; body: unknown };

/** A JSON response with `status`. */
export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function readBody(request: Request): Promise<unknown> {
  const text = await request.text();
  return text === '' ? null : (JSON.parse(text) as unknown);
}

/**
 * The API client over a network that answers each route (`'GET /topics'`, the method and the path
 * without its query) from its own list, in order; the last answer of a list is given again for
 * every later request. `requests` records each request as it was sent.
 */
function fakeApi(routes: Record<string, Answer[]>) {
  const requests: SentRequest[] = [];
  const queues = new Map(Object.entries(routes).map(([route, list]) => [route, [...list]]));
  const send = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const body = await readBody(request.clone());
    requests.push({ method: request.method, path: url.pathname, query: url.search, body });
    const queue = queues.get(`${request.method} ${url.pathname}`) ?? [];
    const answer = queue.length > 1 ? queue.shift() : queue[0];
    if (answer === undefined) throw new Error(`no answer for ${request.method} ${url.pathname}`);
    if (answer instanceof Error) throw answer;
    return answer instanceof Response ? answer.clone() : answer;
  };
  const api = clientModule.createApiClient({
    baseUrl: 'https://api.test',
    send,
    sleep: () => Promise.resolve(),
    getAccessToken: () => Promise.resolve('token-marker'),
    refreshSession: () => Promise.resolve(false),
    signOut: () => Promise.resolve(),
  });
  return { api, requests };
}

/**
 * Makes the app's `api` (src/api/client.ts) a client over a fake network that answers `routes`
 * (see `fakeApi`), until `jest.restoreAllMocks()`, which each test that calls it runs after it.
 * Returns the requests the network was sent.
 */
export function serveApi(routes: Record<string, Answer[]>) {
  const fake = fakeApi(routes);
  jest.replaceProperty(clientModule, 'api', fake.api);
  return fake.requests;
}

/**
 * A fresh query cache and a wrapper that provides it, so no test sees another's answers. It also
 * makes TanStack Query tell its observers at once (for every cache): by default it batches
 * through a `setTimeout(0)`, which under Jest's fake timers lands after the test has looked.
 */
export function queryWrapper() {
  notifyManager.setScheduler((callback) => {
    callback();
  });
  const client = createQueryClient();
  // No garbage-collection timer: a test on real timers would otherwise keep Jest open for 5 min.
  client.setDefaultOptions({
    ...client.getDefaultOptions(),
    queries: { ...client.getDefaultOptions().queries, gcTime: Infinity },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}
