---
title: Hash map patterns
icon: 🗝️
date: 2026-11-04
updated: 2026-11-06
tags: [dsa, arrays, must-know]
summary: When you see "find a pair" or "count occurrences", reach for a hash map first.
---
## The core idea

Trade **memory for time**: store what you've seen so each lookup is $O(1)$ instead of rescanning the array.

| Problem shape | Store in the map | Complexity |
| --- | --- | --- |
| Two Sum | value → index | $O(n)$ time, $O(n)$ space |
| Group anagrams | sorted word → list | $O(n \cdot k \log k)$ |
| Longest substring without repeats | char → last index | $O(n)$ |

```python
def two_sum(nums, target):
    seen = {}  # value -> index
    for i, x in enumerate(nums):
        if target - x in seen:
            return [seen[target - x], i]
        seen[x] = i
```

::: warning Common mistake
Check for the complement **before** inserting the current number, otherwise `[3]` with target `6` returns the same index twice.
:::

## Practice questions

::: qa Why is Two Sum O(n) with a hash map but O(n²) without?
Without a map, every element scans the rest of the array for its complement: $\frac{n(n-1)}{2}$ comparisons. With a map, each lookup is an average $O(1)$ hash, so one pass is enough.
:::

::: qa When would you NOT use a hash map here?
If the array is **already sorted**, two pointers give $O(n)$ time with $O(1)$ extra space, which beats the map on memory.
:::

## Checklist

- [x] Two Sum
- [x] Group Anagrams
- [ ] Longest Consecutive Sequence
- [ ] Subarray Sum Equals K
