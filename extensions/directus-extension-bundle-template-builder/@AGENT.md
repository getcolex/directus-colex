# Agent Build Instructions - Template Builder Bundle

## Project Setup

```bash
cd /Users/parijat/Documents/colex/extensions/directus-extension-bundle-template-builder

# Install dependencies
npm install
```

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- --run src/shared/types.test.ts

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage
```

## Build Commands

```bash
# Build bundle extension
npm run build

# Build in watch mode (development)
npm run dev
```

## Reference Implementation

The monolithic extension to copy from:
```
/Users/parijat/Documents/colex/extensions/directus-extension-endpoint-template-builder/
├── src/
│   ├── index.ts              # 3700 lines - extract routes from here
│   ├── lib/                  # Copy these to shared/
│   │   ├── blackboard-types.ts
│   │   ├── blackboard-service.ts
│   │   ├── conflict-detector.ts
│   │   ├── sort-order.ts
│   │   ├── format-blackboard-context.ts
│   │   └── *.test.ts         # Copy tests too
│   └── tools/
│       └── definitions.ts    # Tool schemas
```

## Copy Commands

```bash
# Copy a file with its test
cp ../directus-extension-endpoint-template-builder/src/lib/blackboard-types.ts src/shared/types.ts
cp ../directus-extension-endpoint-template-builder/src/lib/blackboard-types.test.ts src/shared/types.test.ts

# Then fix imports in both files
# Run test to verify
npm test -- --run src/shared/types.test.ts
```

## Bundle Structure

```
src/
├── shared/                   # Shared utilities (from lib/)
│   ├── index.ts             # Barrel export
│   ├── types.ts             # BlackboardEntry, Conflict, Skills
│   ├── blackboard-service.ts
│   ├── conflict-detector.ts
│   ├── sort-order.ts
│   ├── format-blackboard-context.ts
│   ├── tools.ts             # Anthropic tool definitions
│   └── llm.ts               # LLM service (new)
│
├── core/                     # Endpoint: /tb-core/*
│   └── index.ts
│
├── chat/                     # Endpoint: /tb-chat/*
│   └── index.ts
│
├── tasks/                    # Endpoint: /tb-tasks/*
│   └── index.ts
│
└── projects/                 # Endpoint: /tb-projects/*
    └── index.ts
```

## Key Learnings

- Directus bundle requires `directus:extension.type: "bundle"` in package.json
- Each endpoint entry needs: `{ type: "endpoint", name: "...", source: "..." }`
- Shared code can be imported with relative paths `../shared/`
- Tests run with vitest, same as reference implementation

## Feature Completion Checklist

- [ ] Test written first (TDD)
- [ ] Test fails for right reason
- [ ] Implementation passes test
- [ ] All related tests pass
- [ ] Code committed with conventional message
- [ ] @fix_plan.md task marked `[x]`
