# LayerMix CLI

Support package for LayerMix framework.

It provides:
 - The default packages, so upgrades are easier
 - A CLI tool to:
   - Codegen
   - Run all kinds for checks
   - AI-enhanced code generation with documentation context

## AI Enhancement

The CLI includes an AI enhancement feature that can improve your generated code by:

1. Using Aider to enhance code based on your instructions
2. Automatically finding relevant documentation using vector search
3. Including documentation context to produce better results

### How it works

When you generate code, you'll be asked if you want to enhance it with AI. If you choose to do so:

1. You'll provide instructions for how to improve the code
2. You can optionally include relevant documentation context
3. The system will search through `docs` files using vector embeddings
4. The most relevant documentation will be included as context for the AI

### Documentation

Place your documentation files in a `docs` directory with the `.md` extension.
The system will automatically generate and cache embeddings in `docs/_embeddings`.

### Requirements

- For automatic documentation search using vector embeddings, you need an OpenAI API key.
- Set the `OPENAI_API_KEY` environment variable before running the CLI.
- If no API key is available, you can still manually select documentation files to include.

## Making a new release
