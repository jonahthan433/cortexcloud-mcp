#!/usr/bin/env node
import { createProxy } from "./server";

const port = Number(process.env.PORT ?? process.env.CORTEX_PROXY_PORT ?? 8402);
const upstream = process.env.CORTEX_UPSTREAM;
const chain = (process.env.CORTEX_CHAIN as "base" | "baseSepolia") ?? "base";
const apiKey = process.env.CORTEX_API_KEY;

const proxy = createProxy({ port, upstream, chain, apiKey });
proxy.start();
