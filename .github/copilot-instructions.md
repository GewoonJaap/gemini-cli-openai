# GitHub Copilot Instructions

## Project Overview

This project is a **Gemini CLI OpenAI Worker** that transforms Google's Gemini models into OpenAI-compatible endpoints using Cloudflare Workers. It provides OAuth2 authentication and real thinking capabilities for Gemini models.

## Tech Stack & Frameworks

### Core Technologies
- **Cloudflare Workers**: Serverless edge computing platform for global deployment
- **Hono**: Fast, lightweight web framework for Cloudflare Workers (similar to Express.js)
- **TypeScript**: Strongly typed JavaScript for better code quality and developer experience
- **Gemini API**: Google's advanced AI models with thinking capabilities

### Key Dependencies
- `hono`: Web framework for routing and middleware
- `@cloudflare/workers-types`: TypeScript definitions for Cloudflare Workers
- `wrangler`: Cloudflare's CLI tool for development and deployment

## Project Structure

```
src/
├── routes/           # API route handlers
│   ├── openai.ts    # OpenAI-compatible endpoints
│   └── debug.ts     # Debug and health check routes
├── middlewares/      # Hono middleware
│   ├── auth.ts      # Authentication middleware
│   └── logging.ts   # Request logging middleware
├── helpers/         # Helper classes and utilities
│   └── generation-config-validator.ts # Model config validation
├── utils/           # Utility functions
│   └── image-utils.ts # Image validation utilities
├── auth.ts          # OAuth2 authentication manager
├── gemini-client.ts # Gemini API client and streaming
├── stream-transformer.ts # OpenAI stream format transformer
├── models.ts        # Model definitions and configurations
├── constants.ts     # Application constants
├── types.ts         # TypeScript type definitions
├── config.ts        # Configuration constants
└── index.ts         # Main application entry point
```

## Important NPM Commands

### Development Commands
```bash
npm run dev          # Start development server with hot reload
npm run build        # Build and validate (dry-run deployment)
npm run deploy       # Deploy to Cloudflare Workers
```

### Code Quality Commands
```bash
npm run lint         # Run ESLint to check code quality
npm run lint:fix     # Auto-fix linting issues
npm run format       # Format code with Prettier
npm run format:check # Check if code is properly formatted
```

## Development Guidelines

### 🔧 Before Submitting Any Feature

**ALWAYS run these commands after implementing a feature:**

1. **Lint the code**:
   ```bash
   npm run lint
   ```

2. **Build the project**:
   ```bash
   npm run build
   ```

3. **Fix any issues** found by linting or building before proceeding.

### 📝 Code Quality Standards

#### TypeScript Best Practices
- **Always use proper TypeScript types** - avoid `any` type
- **Import types from `src/types.ts`** for consistency
- **Create interfaces** for complex objects and API responses
- **Use type guards** when needed for runtime type checking

#### Constants Management
- **Use constants from `src/constants.ts`** instead of magic numbers/strings
- **Add new constants** to the constants file when introducing configurable values
- **Group related constants** with clear comments explaining their purpose

#### Example:
```typescript
// ❌ Bad - magic numbers
const generationConfig = {
  temperature: 0.7,
  thinkingBudget: -1
};

// ✅ Good - using constants
import { DEFAULT_TEMPERATURE, DEFAULT_THINKING_BUDGET } from "./constants";

const generationConfig = {
  temperature: DEFAULT_TEMPERATURE,
  thinkingBudget: DEFAULT_THINKING_BUDGET
};
```

### 🏗️ Architecture Patterns

#### Request Flow
1. **Route Handler** (`src/routes/openai.ts`) - Handles HTTP requests
2. **Authentication** (`src/auth.ts`) - Manages OAuth2 tokens
3. **Gemini Client** (`src/gemini-client.ts`) - Communicates with Gemini API
4. **Stream Transformer** (`src/stream-transformer.ts`) - Converts to OpenAI format

#### Error Handling
- **Always handle errors gracefully** with proper HTTP status codes
- **Log errors** with descriptive messages for debugging
- **Return user-friendly error messages** in API responses

#### Environment Configuration
- **Use environment variables** for configuration (see `Env` interface in `types.ts`)
- **Provide sensible defaults** where possible
- **Document environment variables** in README.md

### 📚 Documentation Requirements

#### README Updates
**Always update `README.md` when:**
- Adding new features or capabilities
- Changing API behavior or parameters
- Modifying environment variables
- Adding new models or configuration options

#### Code Documentation
- **Add JSDoc comments** for public methods and complex functions
- **Include inline comments** for complex logic or business rules
- **Document type interfaces** with clear descriptions


### 🚀 Deployment Considerations

#### Environment Variables
Key environment variables to set:
- `GCP_SERVICE_ACCOUNT`: OAuth2 credentials JSON
- `ENABLE_REAL_THINKING`: Set to "true" to enable real thinking
- `ENABLE_FAKE_THINKING`: Set to "true" for development/testing
- `STREAM_THINKING_AS_CONTENT`: Set to "true" for DeepSeek R1 style output

#### Cloudflare Workers Limits
- **Bundle size**: Keep under 1MB compressed
- **Memory usage**: Optimize for Workers memory constraints
- **CPU time**: Avoid long-running synchronous operations

### 🔒 Security Best Practices

- **Never log sensitive data** (tokens, credentials)
- **Validate all inputs** before processing
- **Use proper CORS headers** for web client compatibility
- **Implement rate limiting** considerations

### 📋 Feature Development Checklist

When implementing a new feature:

- [ ] Define types in `src/types.ts`
- [ ] Add constants to `src/constants.ts` if needed
- [ ] Implement feature with proper error handling
- [ ] Add JSDoc comments for public APIs
- [ ] Update README.md with new functionality
- [ ] Run `npm run lint` and fix any issues
- [ ] Run `npm run build` and ensure it passes
- [ ] Test manually with different scenarios
- [ ] Update any relevant documentation

### 🎯 Common Patterns

#### Adding a New Route
```typescript
// 1. Define in routes/openai.ts
OpenAIRoute.get("/new-endpoint", async (c) => {
  // Implementation
});

// 2. Add types if needed
interface NewEndpointRequest {
  // ...
}

// 3. Update README with new endpoint documentation
```

#### Adding Configuration Constants
```typescript
// 1. Add to src/constants.ts
export const NEW_CONFIG_VALUE = 42;

// 2. Import and use
import { NEW_CONFIG_VALUE } from "./constants";

// 3. Document in README if user-facing
```

This structure ensures maintainable, type-safe, and well-documented code that follows Cloudflare Workers and Hono best practices.
