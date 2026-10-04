/**
 * Provider registry + a single place that reconciles remote state into the
 * in-memory store.
 */

import type { Provider, Repo } from '../../src/core/types';
import { githubProvider } from './github';
import { gitlabProvider } from './gitlab';
import type { GitProvider } from './types';

const providers: Record<Provider, GitProvider> = {
  github: githubProvider,
  gitlab: gitlabProvider,
};

export function providerFor(repo: Pick<Repo, 'provider'>): GitProvider {
  return providers[repo.provider];
}

export function providerForId(id: Provider): GitProvider {
  return providers[id];
}

export { githubProvider, gitlabProvider };
export type { GitProvider };
