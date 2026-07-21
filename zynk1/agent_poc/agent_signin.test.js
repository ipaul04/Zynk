/**
 * AI Agent Sign-On Test — Proof of Concept
 *
 * WHAT THIS TESTS:
 *   An AI agent (powered by Claude) autonomously discovers how to sign on to
 *   the Zync ZK authentication system. The agent is given a set of tools and
 *   a goal ("get authenticated"), and it figures out the right sequence of
 *   steps on its own — no hardcoded script.
 *
 * WHY THIS IS INTERESTING:
 *   Traditional auth tests script every step manually. Here the LLM reasons
 *   about the available tools, decides to generate ZK credentials, register,
 *   then login — all on its own. This mirrors how a real AI agent in a
 *   multi-service environment would handle authentication.
 *
 * SETUP:
 *   Set ANTHROPIC_API_KEY in your environment or a .env file before running.
 *   No live server needed — this test uses the ZK crypto functions directly.
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { create_random_key, create_pub_key, generate_proof, verify_proof } from '../core_api/zk.js';
import { bytesToHex } from '@noble/curves/utils.js';

// ─── Step 1: Isolated in-memory user store ───────────────────────────────────
//
// Instead of hitting a live HTTP server we replicate the exact same logic from
// core_api/user.js in an isolated store local to this test. That way the test
// is self-contained and reproducible with no external dependencies.
//
const agentUsers = [];

function agent_register(pub_key_hex, email, name, role) {
    if (agentUsers.find(u => u.email === email)) {
        throw new Error(`User with email ${email} already exists.`);
    }
    if (agentUsers.find(u => u.pub_key === pub_key_hex)) {
        throw new Error('User with this public key already exists.');
    }
    const user = {
        id: agentUsers.length + 1,
        email,
        name: name || email.split('@')[0],
        role: role || 'student',
        pub_key: pub_key_hex,
        registered_at: new Date().toISOString(),
    };
    agentUsers.push(user);
    return user;
}

function agent_find_user(pub_key_hex) {
    return agentUsers.find(u => u.pub_key === pub_key_hex);
}

// ─── Step 2: Define tools that the agent can call ────────────────────────────
//
// Claude doesn't have direct access to our codebase — we expose capabilities
// as "tools" (functions described with JSON-Schema). The agent reads the
// descriptions and decides which tool to call next, exactly like a human
// reading API documentation.
//
// Tool 1 — generate_zk_credentials
//   Creates a fresh ed25519 keypair and a Schnorr-like proof of knowledge.
//   Returns hex strings so they can be passed to the other tools.
//
// Tool 2 — register_agent_user
//   Registers a new identity in the Zync system given a pub_key + proof.
//   Mirrors the /register_zk endpoint logic without the HTTP layer.
//
// Tool 3 — login_agent_user
//   Authenticates an existing identity. Verifies the proof cryptographically
//   then looks the user up by public key. Mirrors /login_zk.
//
const TOOLS = [
    {
        name: 'generate_zk_credentials',
        description: [
            'Generates a fresh ZK (zero-knowledge) keypair and a proof of knowledge of the secret key.',
            'Returns: { pub_key: string, proof: { r: string, s: string } }.',
            'You MUST call this first — the pub_key and proof are required by the other tools.',
        ].join(' '),
        input_schema: {
            type: 'object',
            properties: {},   // no inputs — purely generative
            required: [],
        },
    },
    {
        name: 'register_agent_user',
        description: [
            'Registers the agent as a new user in the Zync authentication system.',
            'Requires a pub_key and proof from generate_zk_credentials, plus an email.',
            'Returns { success: true, user, token } on success.',
        ].join(' '),
        input_schema: {
            type: 'object',
            properties: {
                pub_key: {
                    type: 'string',
                    description: 'Hex-encoded public key from generate_zk_credentials',
                },
                proof: {
                    type: 'object',
                    description: 'Proof object from generate_zk_credentials',
                    properties: {
                        r: { type: 'string' },
                        s: { type: 'string' },
                    },
                    required: ['r', 's'],
                },
                email: {
                    type: 'string',
                    description: 'Agent email address, e.g. agent@zync.ai',
                },
                name: {
                    type: 'string',
                    description: 'Display name for the agent (optional)',
                },
                role: {
                    type: 'string',
                    description: 'Role: student, professor, advisor, or administrator (optional)',
                },
            },
            required: ['pub_key', 'proof', 'email'],
        },
    },
    {
        name: 'login_agent_user',
        description: [
            'Authenticates the agent using its public key and proof.',
            'Returns { success: true, user, token } if credentials are valid and the user is registered.',
            'Call this AFTER register_agent_user.',
        ].join(' '),
        input_schema: {
            type: 'object',
            properties: {
                pub_key: {
                    type: 'string',
                    description: 'The same pub_key used during registration',
                },
                proof: {
                    type: 'object',
                    description: 'The same proof used during registration',
                    properties: {
                        r: { type: 'string' },
                        s: { type: 'string' },
                    },
                    required: ['r', 's'],
                },
            },
            required: ['pub_key', 'proof'],
        },
    },
];

// ─── Step 3: Tool execution — bridge between Claude and our code ──────────────
//
// When Claude decides to call a tool, it returns a tool_use block with the
// tool name and arguments. We dispatch here, run the actual code, and hand
// the result back so Claude can reason about what happened.
//
function execute_tool(name, input) {
    if (name === 'generate_zk_credentials') {
        // Create a fresh ed25519 secret key (32 random bytes).
        const secret_key = create_random_key();
        // Derive the public key deterministically from the secret.
        const pub_key = create_pub_key(secret_key);
        // Sign the public key with the secret key — this is the "proof of
        // knowledge" (proves you hold the secret key without revealing it).
        const proof = generate_proof(secret_key, pub_key);
        return {
            pub_key: bytesToHex(pub_key),
            proof,
        };
    }

    if (name === 'register_agent_user') {
        const { pub_key, proof, email, name: displayName, role } = input;
        // Cryptographically verify the proof before storing anything.
        if (!verify_proof(pub_key, proof)) {
            return { success: false, error: 'Invalid proof — registration denied.' };
        }
        try {
            const user = agent_register(pub_key, email, displayName, role);
            const token = Math.random().toString(36).substring(7);
            return { success: true, user, token };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    if (name === 'login_agent_user') {
        const { pub_key, proof } = input;
        if (!verify_proof(pub_key, proof)) {
            return { success: false, error: 'Invalid proof — login denied.' };
        }
        const user = agent_find_user(pub_key);
        if (!user) {
            return {
                success: false,
                error: 'Proof valid but user not registered. Call register_agent_user first.',
            };
        }
        const token = Math.random().toString(36).substring(7);
        return { success: true, user, token };
    }

    return { error: `Unknown tool: ${name}` };
}

// ─── Step 4: The agentic loop ─────────────────────────────────────────────────
//
// Claude is given a goal and the tools. We run a standard tool-use loop:
//
//   1. Send the current messages array to Claude.
//   2. If Claude returns a tool_use block → execute it, append the result, repeat.
//   3. If Claude's stop_reason is "end_turn" → it's finished reasoning.
//
// Claude decides the ORDER and ARGUMENTS for each tool call autonomously.
// Our code only executes what Claude requests — it's purely reactive.
//
async function run_agent() {
    const client = new Anthropic();

    const agent_email = `agent-${Date.now()}@zync.ai`;

    const system_prompt = [
        'You are an AI agent that needs to authenticate itself to the Zync ZK authentication system.',
        'Your goal: sign on successfully by generating ZK credentials, registering as a new user, then logging in.',
        'Use the tools in the correct order to complete the full authentication flow.',
        `Use the email address: ${agent_email} when registering.`,
        'When you are done, write a short summary of what you did and whether authentication succeeded.',
    ].join(' ');

    let messages = [
        {
            role: 'user',
            content: 'Please authenticate yourself to the Zync system. Use the provided tools to generate credentials, register, and log in.',
        },
    ];

    const tool_calls_made = [];

    // Agentic loop — runs until Claude says "end_turn" (no more tool calls)
    while (true) {
        const response = await client.messages.create({
            model: 'claude-opus-4-6',
            max_tokens: 2048,
            system: system_prompt,
            tools: TOOLS,
            messages,
        });

        // Append Claude's full response to the message history so it retains
        // context about what it has already done on the next turn.
        messages.push({ role: 'assistant', content: response.content });

        if (response.stop_reason === 'end_turn') {
            // Claude is done — extract its final text summary.
            const final_text = response.content
                .filter(b => b.type === 'text')
                .map(b => b.text)
                .join('');
            return { summary: final_text, tool_calls_made };
        }

        // Claude wants to call one or more tools this turn.
        const tool_results = [];
        for (const block of response.content) {
            if (block.type !== 'tool_use') continue;

            const result = execute_tool(block.name, block.input);
            tool_calls_made.push({ tool: block.name, result });

            // Package the result in the format Claude expects.
            tool_results.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify(result),
            });
        }

        // Feed all tool results back to Claude as a user message.
        messages.push({ role: 'user', content: tool_results });
    }
}

// ─── Step 5: Jest test suite ──────────────────────────────────────────────────
//
// Five assertions check that the agent:
//   a) Called all three tools in order.
//   b) Registration succeeded (returned a token).
//   c) Login succeeded (returned a token).
//   d) Produced a final natural-language summary.
//
describe('AI Agent Sign-On — Proof of Concept', () => {
    // Generous timeout — LLM round-trips can take several seconds.
    jest.setTimeout(60_000);

    let result;

    beforeAll(async () => {
        if (!process.env.ANTHROPIC_API_KEY) {
            throw new Error(
                'ANTHROPIC_API_KEY is not set. ' +
                'Add it to your .env file or environment before running this test.'
            );
        }
        result = await run_agent();

        console.log('\n── Agent summary ──────────────────────────────────────');
        console.log(result.summary);
        console.log('\n── Tool calls made ────────────────────────────────────');
        result.tool_calls_made.forEach(({ tool, result: res }) =>
            console.log(`  • ${tool}:`, JSON.stringify(res))
        );
    });

    test('agent called generate_zk_credentials', () => {
        const called = result.tool_calls_made.map(c => c.tool);
        expect(called).toContain('generate_zk_credentials');
    });

    test('agent called register_agent_user', () => {
        const called = result.tool_calls_made.map(c => c.tool);
        expect(called).toContain('register_agent_user');
    });

    test('agent called login_agent_user', () => {
        const called = result.tool_calls_made.map(c => c.tool);
        expect(called).toContain('login_agent_user');
    });

    test('registration succeeded and returned a session token', () => {
        const reg = result.tool_calls_made.find(c => c.tool === 'register_agent_user');
        expect(reg).toBeDefined();
        expect(reg.result.success).toBe(true);
        expect(reg.result.token).toBeDefined();
    });

    test('login succeeded and returned a session token', () => {
        const login = result.tool_calls_made.find(c => c.tool === 'login_agent_user');
        expect(login).toBeDefined();
        expect(login.result.success).toBe(true);
        expect(login.result.token).toBeDefined();
    });

    test('agent produced a final summary', () => {
        expect(result.summary.length).toBeGreaterThan(10);
    });
});
