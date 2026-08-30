/**
 * Sign in to DeepSeek Harness providers with a subscription.
 *
 * The harness already knows how to do this. `@deepseek-ai/dsh-llm-pi-ai`
 * registers an authorization flow for every provider its catalogue can log in
 * to, including "Anthropic (Claude Pro/Max)" and "OpenAI (ChatGPT Plus/Pro)".
 * But that registration is gated behind `ctx.inject(['authorization'], ...)`,
 * and no shipped bundle mounts `@deepseek-ai/dsh-authorization`, so the flows
 * are never registered; and nothing anywhere calls `begin()`, so even mounted
 * they would have no surface. The result is working OAuth that cannot be
 * reached, and an `apiKeyEnv` that a subscription has no key for.
 *
 * This plugin supplies both halves: the patch mounts the registry, and this
 * file gives the flows a place to be driven from.
 *
 * @module dsh-login
 */
import { credentialKeyId } from '@deepseek-ai/dsh-credentials';
export const name = 'login';
export const inject = ['authorization', 'commands', 'credentials'];
/* A CredentialKey is a branded `scope/id` string, not a pair, so the key IS its
   own display text and only the id half needs extracting. */
/**
 * Match what the user typed against a registered flow.
 *
 * Bare provider ids are what anyone will actually type, so `anthropic` finds
 * `llm-pi-ai/anthropic`; the full key still works, and an ambiguous prefix is
 * reported rather than guessed.
 */
const findFlows = (entries, typed) => {
    const want = typed.trim().toLowerCase();
    const exact = entries.filter(e => String(e.key).toLowerCase() === want || credentialKeyId(e.key).toLowerCase() === want);
    return exact.length > 0 ? exact : entries.filter(e => String(e.key).toLowerCase().includes(want));
};
export function apply(ctx, config = {}) {
    const open = config.browserCommand ?? 'xdg-open';
    const openPage = async (url) => {
        const { spawn } = await import('node:child_process');
        return new Promise(resolve => {
            try {
                const child = spawn(open, [url], { stdio: 'ignore', detached: true });
                child.on('error', () => resolve(false));
                child.unref();
                resolve(true);
            }
            catch {
                resolve(false);
            }
        });
    };
    const configured = async (key) => {
        try {
            return (await ctx.credentials.describeRecord(key)).configured;
        }
        catch {
            return false;
        }
    };
    /** `/login` with no argument: what can be signed in to, and what already is. */
    const listFlows = async () => {
        const entries = ctx.authorization.list();
        if (entries.length === 0) {
            return {
                kind: 'error',
                text: 'No authorization flows are registered. The provider plugin that owns them is not mounted.',
            };
        }
        const lines = [];
        for (const entry of entries) {
            const oauth = entry.methods.some(method => method.id === 'oauth');
            if (!oauth)
                continue;
            const method = entry.methods.find(m => m.id === 'oauth');
            const state = entry.inFlight ? 'in progress' : (await configured(entry.key)) ? 'signed in' : 'not signed in';
            lines.push(`  ${credentialKeyId(entry.key).padEnd(16)} ${state.padEnd(14)} ${method?.label ?? entry.label}`);
        }
        return {
            kind: 'success',
            text: `Sign in with /login <provider>.\n\n${lines.join('\n')}\n\n`
                + 'A browser page opens; approve there and the session finishes on its own.',
        };
    };
    const runLogin = async (invocation, typed) => {
        const matches = findFlows(ctx.authorization.list(), typed);
        if (matches.length === 0) {
            return { kind: 'error', text: `No provider matches "${typed}". Run /login with no argument to see the list.` };
        }
        if (matches.length > 1) {
            return {
                kind: 'error',
                text: `"${typed}" matches ${matches.length} providers: ${matches.map(m => credentialKeyId(m.key)).join(', ')}. Name one exactly.`,
            };
        }
        const [entry] = matches;
        if (entry.inFlight) {
            return { kind: 'error', text: `A sign-in for ${credentialKeyId(entry.key)} is already running. Finish it in the browser, or wait for it to time out.` };
        }
        const method = entry.methods.find(m => m.id === 'oauth') ?? entry.methods[0];
        /*
         * The flow races a loopback callback against a pasted code. This surface
         * plays only the callback half: it opens the page and leaves the prompt
         * unanswered rather than declining it, because declining would settle the
         * race against the half that actually works here. The prompt's own signal
         * is what ends it once the callback wins.
         */
        const notices = [];
        let opened = false;
        const interaction = {
            notify: (notice) => {
                notices.push(notice.message);
                if (notice.url !== undefined)
                    void openPage(notice.url).then(ok => { opened ||= ok; });
            },
            prompt: (prompt) => {
                // A method choice this surface can answer; anything else waits.
                if (prompt.kind === 'select' && prompt.options.length > 0) {
                    return Promise.resolve(prompt.options[0].id);
                }
                return new Promise((_resolve, reject) => {
                    prompt.signal?.addEventListener('abort', () => reject(new Error('prompt withdrawn')), { once: true });
                });
            },
        };
        try {
            const outcome = await ctx.authorization.begin({
                key: entry.key, method: method?.id, interaction, signal: invocation.signal,
            });
            if (outcome.status !== 'authorized') {
                return { kind: 'error', text: `Sign-in to ${credentialKeyId(entry.key)} was cancelled.` };
            }
            return {
                kind: 'success',
                text: `Signed in to ${entry.label}. The credential is stored in the harness credential file and refreshes itself.\n\n`
                    + `Select it with the provider route "${credentialKeyId(entry.key)}".`,
            };
        }
        catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            const hint = opened
                ? ''
                : `\n\nNothing opened a browser here. Open this yourself and approve it:\n  ${notices.join('\n  ')}`;
            return { kind: 'error', text: `Sign-in to ${credentialKeyId(entry.key)} failed: ${detail}${hint}` };
        }
    };
    ctx.effect(() => ctx.commands.register({
        name: 'login',
        description: 'Sign in to a model provider with your subscription',
        input: { hint: 'provider id, or nothing to list what is available' },
        handler: async (invocation) => {
            const typed = invocation.rawInput.trim();
            return typed === '' ? listFlows() : runLogin(invocation, typed);
        },
    }));
    ctx.effect(() => ctx.commands.register({
        name: 'logout',
        description: 'Forget a stored provider credential',
        input: { hint: 'provider id' },
        handler: async (invocation) => {
            const typed = invocation.rawInput.trim();
            if (typed === '')
                return { kind: 'error', text: 'Name the provider to sign out of.' };
            const matches = findFlows(ctx.authorization.list(), typed);
            if (matches.length !== 1) {
                return { kind: 'error', text: `"${typed}" does not name exactly one provider.` };
            }
            const [entry] = matches;
            if (!(await configured(entry.key))) {
                return { kind: 'success', text: `${credentialKeyId(entry.key)} was not signed in.` };
            }
            await ctx.credentials.deleteRecord(entry.key);
            return { kind: 'success', text: `Signed out of ${entry.label}.` };
        },
    }));
}
//# sourceMappingURL=index.js.map