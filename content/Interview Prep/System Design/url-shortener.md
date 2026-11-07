---
title: Designing a URL shortener
icon: 🔗
date: 2026-11-01
tags: [system design, ai chat]
summary: Worked through the classic question with ChatGPT, then corrected its storage maths.
source: chatgpt
model: GPT-5
shareUrl: https://chatgpt.com/share/example
---
I used this as a mock interview. My notes are in the purple callouts.

::: user
Walk me through designing a URL shortener like bit.ly. Start with requirements.
:::

::: assistant
**Functional requirements**

1. Given a long URL, return a short one.
2. Redirect short → long with low latency.
3. Optional: custom aliases, expiry, click analytics.

**Non-functional:** very read-heavy (≈100:1 reads to writes), highly available, redirects in under 50 ms.

**Key generation:** base62-encode a 64-bit ID from a distributed counter:

```python
ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

def encode(n: int) -> str:
    s = []
    while n:
        n, r = divmod(n, 62)
        s.append(ALPHABET[r])
    return "".join(reversed(s)) or "0"
```

Seven characters give $62^7 \approx 3.5 \times 10^{12}$ unique codes.
:::

::: note
Interviewers want the read/write ratio stated early. It justifies the cache-first design.
:::

::: user
How much storage for 100M new URLs per month over 5 years?
:::

::: assistant
100M × 12 × 5 = **6 billion** records. At ~500 bytes each that's about **3 TB**, small enough for a sharded key-value store.
:::

::: toggle My follow-up questions to practise
- How do you prevent the counter from being a single point of failure?
- How would you add analytics without slowing redirects?
- 301 vs 302: which one, and why?
:::
