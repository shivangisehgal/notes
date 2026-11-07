---
title: A short argument about naming variables
icon: 🏷️
date: 2026-10-20
tags: [programming]
source: claude
model: Claude Opus
---
::: user
Is `userAccountCreationTimestamp` too long for a variable name?
:::

::: assistant
It depends on how far the name travels. **The length of a name should match the size of its scope.**

- A loop index that lives for three lines can be `i`.
- Inside a `UserAccount` class, `createdAt` says the same thing.
:::
