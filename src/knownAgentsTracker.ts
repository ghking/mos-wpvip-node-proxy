import { KnownAgents } from '@knownagents/sdk'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { normalizeHostname } from './domainMap.js'
import type { ProxyEnv } from './env.js'

const knownAgentsOptions = {
    flushQueueSize: 1000,
    flushIntervalInMilliseconds: 10000,
}

export function createKnownAgentsPageviewTracker(
    env: ProxyEnv,
): ((request: IncomingMessage, response: ServerResponse) => void) | undefined {
    if (env.domainMap) {
        const clientByHost = new Map<string, KnownAgents>()
        for (const [host, entry] of Object.entries(env.domainMap)) {
            if (entry.knownAgentsAccessToken) {
                clientByHost.set(host, new KnownAgents(entry.knownAgentsAccessToken, knownAgentsOptions))
            }
        }

        if (clientByHost.size === 0) {
            return undefined
        }

        return (request: IncomingMessage, response: ServerResponse): void => {
            const hostname = normalizeHostname(request.headers.host ?? '')
            clientByHost.get(hostname)?.trackPageviewOrRESTCall(request, response)
        }
    }

    if (env.KNOWN_AGENTS_ACCESS_TOKEN) {
        const client = new KnownAgents(env.KNOWN_AGENTS_ACCESS_TOKEN, knownAgentsOptions)
        return (request: IncomingMessage, response: ServerResponse): void => {
            client.trackPageviewOrRESTCall(request, response)
        }
    }

    return undefined
}
