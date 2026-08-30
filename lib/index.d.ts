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
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "login";
export declare const inject: string[];
export interface Config {
    /**
     * Command run to open a page in the browser. The OAuth flows race a loopback
     * callback against a pasted code, so opening the page is what lets the
     * callback win and the whole thing finish without anyone typing anything.
     */
    browserCommand?: string;
}
export declare function apply(ctx: Context, config?: Config): void;
//# sourceMappingURL=index.d.ts.map