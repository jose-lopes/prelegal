---
name: Cerebras Inference
description: Use this to write code to call an LLM using LiteLLM and OpenRouter with the Cerebras inference provider
---

# Calling an LLM via Cerebras

These instructions allow you write code to call an LLM with Cerebras specified as the inference provider.  
This method uses LiteLLM and OpenRouter.

## Setup

The OPENROUTER_PM_API_KEY must be set in environment variable.  

Use golang with https://github.com/voocel/litellm to use openrouter provider
