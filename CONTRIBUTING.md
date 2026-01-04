# Contributing to Thymer Sync Hub

Thanks for your interest in contributing! This project powers the sync and agent ecosystem for [Thymer](https://thymer.com).

## Philosophy: Fork First

This repo is designed to be **forked and customized**. We encourage you to:

1. **Fork the repo** and make it your own
2. **Add your own sync plugins** for services you use
3. **Customize collections** to fit your workflow
4. **Experiment freely** without worrying about upstream

Your fork is your playground. Go wild!

## When to Submit a Pull Request

Only submit PRs for changes that benefit the **whole community**:

- Bug fixes that affect everyone
- Security improvements
- Documentation improvements
- New sync plugins for popular services (GitHub, Google, etc.)
- Collection schema improvements that are broadly useful
- Performance optimizations

**Don't submit PRs for:**

- Personal customizations (keep these in your fork)
- Niche integrations only you would use
- Breaking changes to collection schemas
- Features that add complexity without broad benefit

When in doubt, open an issue first to discuss.

## Development Setup

```bash
# Clone the repo
git clone https://github.com/riclib/thymer-synchub.git
cd thymer-synchub

# List available tasks
task

# Create a new plugin from template
task new:plugin -- my-source

# Validate JSON files
task validate:json
task validate:plugins

# Copy plugin to clipboard for Thymer
task copy:plugin -- github
```

## Using Claude Code

This repo is optimized for development with [Claude Code](https://claude.ai/code). The `CLAUDE.md` file provides context about the architecture and patterns.

### Getting Started

```bash
# Open the repo in Claude Code
cd thymer-synchub
claude

# Or start with a specific task
claude "create a new sync plugin for Notion"
```

### Effective Prompts

**Creating a new sync plugin:**
```
Create a sync plugin for [Service] that syncs [data type] to the [Collection] collection.
The API endpoint is [url] and uses [auth method].
```

**Understanding the codebase:**
```
Explain how the sync scheduling works in Sync Hub
```

**Debugging:**
```
Why might a plugin show "unknown" version in the Health dashboard?
```

**Adding features:**
```
Add a new tool to the Calendar collection that returns events for a specific week
```

### Tips for Claude Code

1. **Read CLAUDE.md first** - It contains critical patterns and gotchas
2. **Check the Health dashboard** - After changes, verify versions match
3. **Use `task validate:json`** - Catch JSON errors before testing in Thymer
4. **Test in Thymer** - Copy plugins with `task copy:plugin -- name`
5. **Check the template** - `plugins/_template/` has annotated examples

### The CLAUDE.md File

The `CLAUDE.md` file tells Claude Code about:

- Project architecture (Laundromat pattern)
- SDK patterns and gotchas (record creation quirk, choice fields, etc.)
- How to register with Sync Hub
- Logging conventions (`debug()` vs `log()`)
- Common pitfalls to avoid

Update it when you discover new patterns!

## Code Style

- Use `const VERSION = 'vX.Y.Z';` at the top of plugin files
- Register with Sync Hub using the `synchub-ready` event pattern
- Use `debug()` for routine messages, `log()` only for errors
- Always deduplicate with `external_id`
- Use optional chaining: `record.prop('field')?.set(value)`

## Testing Your Changes

1. Set Log Level to "Debug" in Sync Hub
2. Copy your plugin to Thymer: `task copy:plugin -- name`
3. Check browser console for `[PluginName]` messages
4. Verify in the Health dashboard that versions match
5. Test the actual sync/feature works

## Releases

Releases are managed by the maintainer using:

```bash
task release -- v1.2.3
```

This updates all VERSION constants, commits, tags, and creates a GitHub release.

## Questions?

- Open an issue for bugs or feature discussions
- Check the [Thymer Plugin SDK](https://github.com/thymerapp/thymer-plugin-sdk) for API docs
- Read the `docs/` folder for architecture deep-dives

Happy hacking!
