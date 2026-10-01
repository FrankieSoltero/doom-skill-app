// Test support: the app's real API client over a fake network the test scripts, shared by the
// API source tests. Nothing leaves the test. Not app code.
import { createApiClient } from '../../api/client';

/** What the fake network answers a request with, in order. */
export type Answer = Response | Error | Promise<Response>;

/** A JSON response with `status`. */
export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * The API client over a network that gives `answers` in order, the path and query of each
 * request it was sent, and each request itself (`sent`, for its method and body). The waits
 * between retries take no time.
 */
export function network(...answers: Answer[]) {
  const requests: string[] = [];
  const sent: Request[] = [];
  const send = (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    requests.push(`${url.pathname}${url.search}`);
    sent.push(request);
    const answer = answers.shift();
    if (answer === undefined) throw new Error('no answer scripted');
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  };
  const api = createApiClient({
    baseUrl: 'https://api.test',
    send,
    sleep: () => Promise.resolve(),
    getAccessToken: () => Promise.resolve('token-marker'),
    refreshSession: () => Promise.resolve(false),
    signOut: () => Promise.resolve(),
  });
  return { api, requests, sent };
}
