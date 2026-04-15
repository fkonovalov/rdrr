---
title: "Overview • Svelte Docs"
source: "https://svelte.dev/docs/svelte/overview"
domain: "svelte.dev"
language: "en"
description: "Overview • Svelte documentation"
word_count: 154
---

Svelte is a framework for building user interfaces on the web. It uses a compiler to turn declarative components written in HTML, CSS and JavaScript...

```svelte
<script>
    function greet() {
        alert('Welcome to Svelte!');
    }
</script>

<button onclick={greet}>click me</button>

<style>
    button {
        font-size: 2em;
    }
</style>
```
```svelte
<script lang="ts">
    function greet() {
        alert('Welcome to Svelte!');
    }
</script>

<button onclick={greet}>click me</button>

<style>
    button {
        font-size: 2em;
    }
</style>
```

...into lean, tightly optimized JavaScript.

You can use it to build anything on the web, from standalone components to ambitious full stack apps (using Svelte's companion application framework, [SvelteKit](https://svelte.dev/docs/kit)) and everything in between.

These pages serve as reference documentation. If you're new to Svelte, we recommend starting with the [interactive tutorial](https://svelte.dev/tutorial) and coming back here when you have questions.

You can also try Svelte online in the [playground](https://svelte.dev/playground) or, if you need a more fully-featured environment, on [StackBlitz](https://sveltekit.new/).

[Edit this page on GitHub](https://github.com/sveltejs/svelte/edit/main/documentation/docs/01-introduction/01-overview.md) [llms.txt](https://svelte.dev/docs/svelte/overview/llms.txt)

previous next

[Getting started](https://svelte.dev/docs/svelte/getting-started)

---

## llms.txt

Source: https://svelte.dev/llms.txt

# Svelte Documentation for LLMs

> Svelte is a UI framework that uses a compiler to let you write breathtakingly concise components that do minimal work in the browser, using languages you already know — HTML, CSS and JavaScript.

## Documentation Sets

- [Abridged documentation](https://svelte.dev/llms-medium.txt): A shorter version of the Svelte and SvelteKit documentation, with examples and non-essential content removed
- [Compressed documentation](https://svelte.dev/llms-small.txt): A minimal version of the Svelte and SvelteKit documentation, with many examples and non-essential content removed
- [Complete documentation](https://svelte.dev/llms-full.txt): The complete Svelte and SvelteKit documentation including all examples and additional content

## Individual Package Documentation

- [Svelte documentation](https://svelte.dev/docs/svelte/llms.txt): This is the developer documentation for Svelte.
- [SvelteKit documentation](https://svelte.dev/docs/kit/llms.txt): This is the developer documentation for SvelteKit.
- [Svelte CLI documentation](https://svelte.dev/docs/cli/llms.txt): This is the developer documentation for Svelte CLI.
- [Svelte AI documentation](https://svelte.dev/docs/ai/llms.txt): This is the developer documentation for Svelte AI.

## Notes

- The abridged and compressed documentation excludes legacy compatibility notes, detailed examples, and supplementary information
- The complete documentation includes all content from the official documentation
- Package-specific documentation files contain only the content relevant to that package
- The content is automatically generated from the same source as the official documentation
