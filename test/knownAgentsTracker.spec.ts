import type { IncomingMessage, ServerResponse } from 'node:http'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProxyEnv } from '../src/env'
import { createKnownAgentsPageviewTracker } from '../src/knownAgentsTracker'

const knownAgentsMocks = vi.hoisted(() => ({
    instances: [] as Array<{
        accessToken: string
        options: Record<string, number>
        trackPageviewOrRESTCall: ReturnType<typeof vi.fn>
    }>,
}))

vi.mock('@knownagents/sdk', () => ({
    KnownAgents: class {
        trackPageviewOrRESTCall = vi.fn()

        constructor(accessToken: string, options: Record<string, number>) {
            knownAgentsMocks.instances.push({
                accessToken,
                options,
                trackPageviewOrRESTCall: this.trackPageviewOrRESTCall,
            })
        }
    },
}))

const sharedEnv: ProxyEnv = {
    AUTHENTICATED_USER_JWT_COOKIE_NAME: 'jwt-cookie',
    ANONYMOUS_SESSION_COOKIE_NAME: 'anon-session',
}

describe('knownAgentsTracker', () => {
    beforeEach(() => {
        knownAgentsMocks.instances.length = 0
    })

    it('returns undefined when no access token is configured', () => {
        expect(createKnownAgentsPageviewTracker(sharedEnv)).toBeUndefined()
        expect(createKnownAgentsPageviewTracker({
            ...sharedEnv,
            domainMap: {
                'untracked.example': {
                    originUrl: 'https://origin.example',
                    surfaceSlug: 'web',
                    mosSecretKeyEnvVar: 'MOS_SECRET_UNTRACKED',
                    mosSecretKey: 'sk_test_untracked',
                },
            },
        })).toBeUndefined()
    })

    it('tracks single-domain requests with the configured queue options', () => {
        const tracker = createKnownAgentsPageviewTracker({
            ...sharedEnv,
            KNOWN_AGENTS_ACCESS_TOKEN: 'known_agents_single',
        })
        const request = { headers: { host: 'proxy.example' } } as IncomingMessage
        const response = {} as ServerResponse

        tracker?.(request, response)

        expect(knownAgentsMocks.instances).toHaveLength(1)
        expect(knownAgentsMocks.instances[0]).toMatchObject({
            accessToken: 'known_agents_single',
            options: {
                flushQueueSize: 1000,
                flushIntervalInMilliseconds: 10000,
            },
        })
        expect(knownAgentsMocks.instances[0].trackPageviewOrRESTCall).toHaveBeenCalledWith(request, response)
    })

    it('tracks multi-domain requests with the client matching each normalized host', () => {
        const tracker = createKnownAgentsPageviewTracker({
            ...sharedEnv,
            domainMap: {
                'tracked-a.example': {
                    originUrl: 'https://origin-a.example',
                    surfaceSlug: 'surface-a',
                    mosSecretKeyEnvVar: 'MOS_SECRET_TRACKED_A',
                    mosSecretKey: 'sk_test_tracked_a',
                    knownAgentsAccessTokenEnvVar: 'KNOWN_AGENTS_ACCESS_TOKEN_TRACKED_A',
                    knownAgentsAccessToken: 'known_agents_tracked_a',
                },
                'tracked-b.example': {
                    originUrl: 'https://origin-b.example',
                    surfaceSlug: 'surface-b',
                    mosSecretKeyEnvVar: 'MOS_SECRET_TRACKED_B',
                    mosSecretKey: 'sk_test_tracked_b',
                    knownAgentsAccessTokenEnvVar: 'KNOWN_AGENTS_ACCESS_TOKEN_TRACKED_B',
                    knownAgentsAccessToken: 'known_agents_tracked_b',
                },
                'untracked.example': {
                    originUrl: 'https://origin.example',
                    surfaceSlug: 'web',
                    mosSecretKeyEnvVar: 'MOS_SECRET_UNTRACKED',
                    mosSecretKey: 'sk_test_untracked',
                },
            },
        })
        const requestA = { headers: { host: 'Tracked-A.Example:443' } } as IncomingMessage
        const requestB = { headers: { host: 'tracked-b.example' } } as IncomingMessage
        const response = {} as ServerResponse

        tracker?.(requestA, response)
        tracker?.(requestB, response)
        tracker?.({ headers: { host: 'untracked.example' } } as IncomingMessage, response)

        expect(knownAgentsMocks.instances).toHaveLength(2)
        expect(knownAgentsMocks.instances[0].accessToken).toBe('known_agents_tracked_a')
        expect(knownAgentsMocks.instances[0].trackPageviewOrRESTCall).toHaveBeenCalledWith(requestA, response)
        expect(knownAgentsMocks.instances[0].trackPageviewOrRESTCall).toHaveBeenCalledTimes(1)
        expect(knownAgentsMocks.instances[1].accessToken).toBe('known_agents_tracked_b')
        expect(knownAgentsMocks.instances[1].trackPageviewOrRESTCall).toHaveBeenCalledWith(requestB, response)
        expect(knownAgentsMocks.instances[1].trackPageviewOrRESTCall).toHaveBeenCalledTimes(1)
    })
})
