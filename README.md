# @cyb3rcore/reactify

React SSR + RSC framework for [Fastify](https://fastify.dev). Server-rendered React with streaming, file-system routing, server actions, and React Server Components — all native on Fastify.

## Quick Start

```bash
npx create-reactify-app my-app && cd my-app && npm run dev
```

Scaffold a new project with the CLI and start developing immediately.

## Features

- **Fastify-native routing** with SPA client-side navigation
- **React Server Components** with Fastify request/reply context bridging via AsyncLocalStorage
- **Streaming SSR** using the Web Streams API
- **Server Actions** — call server functions directly from client components
- **Valtio state management** bridge for RSC
- **Server-side head management** via @unhead/react
- **Vite-powered development** with HMR and production builds
- **Express middleware compatibility** via @fastify/middie
- **Built with TypeScript** — full type safety end to end

## Demo

See [reactify.sh](https://reactify.sh) for a live demo repository showcasing the framework in action.

## License

MIT
