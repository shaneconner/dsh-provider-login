# dsh-provider-login

Sign in to [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) **model providers** with a subscription you already pay for, rather than an API key.

## Install

```sh
dsh plugin --profile web add dsh-provider-login
```

Restart `dsh`. Then, in a session:

```
/login                  what you can sign in to, and what you already have
/login openai-codex     sign in with a ChatGPT Plus or Pro subscription
/login anthropic        sign in with a Claude Pro or Max subscription
/logout openai-codex    forget a stored credential
```

A browser page opens, you approve there, and the session finishes on its own. The credential is written to the harness credential file and refreshes itself from then on.

Not to be confused with [`dsh-login`](https://www.npmjs.com/package/dsh-login), which is an unrelated package by another author that puts a password gate on the dsh web port. This one signs you in to the models.

## Why this exists

The harness already knows how to do all of this. `@deepseek-ai/dsh-llm-pi-ai` registers an authorization flow for every provider its catalogue can log in to, six of which offer OAuth, including "Anthropic (Claude Pro/Max)" and "OpenAI (ChatGPT Plus/Pro)". The flows are complete: PKCE, a loopback callback, token storage through the harness credential store, and automatic refresh.

Two things kept them out of reach.

The registration is gated behind `ctx.inject(['authorization'], ...)`, and no shipped bundle mounts `@deepseek-ai/dsh-authorization`. The package exists and is published; nothing provides it. So the flows are registered against a service that is never there.

And nothing anywhere calls `ctx.authorization.begin()`. There is no CLI command and no panel in the web client. Even with the registry mounted, a flow has no surface to be driven from.

The result is working OAuth that cannot be reached, and an `apiKeyEnv` that a subscription has no key for. This plugin supplies both halves: its patch mounts the registry, and it registers the two commands that drive it.

## What it does and does not do

It plays the browser half of the flow. Each flow races a loopback callback against a pasted authorization code; this surface opens the page and leaves the code prompt unanswered rather than declining it, because declining would settle the race against the half that works here. If nothing can open a browser, the error carries the URL so you can open it yourself.

It lists only providers that offer OAuth. A provider that authenticates with an API key is configured through `apiKeyEnv` and the credential file, which is the harness's own path and needs no command.

## A note on Anthropic billing

`/login anthropic` uses the harness's own Anthropic OAuth. Per Pi's documentation of the same library, third-party harness usage through that route **draws from extra usage and is billed per token, not against Claude plan limits**. If you want usage to land on a Pro or Max plan instead, that needs a different mechanism: a provider that drives the Claude Code CLI through the Agent SDK, the way `pi-claude-bridge` does for Pi.

## License

MIT
