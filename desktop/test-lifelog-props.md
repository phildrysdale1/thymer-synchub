# Props, or How the Habit Remembered

> Becoming Lifelog, in which the Squirrel discovers IndexedDB, riclib prescribes ancient scripture, the coffee machine achieves consciousness, and somewhere a checkbox reveals its true nature

---

## Previously on Becoming Lifelog...

The [Laundromat](https://lifelog.my/riclib/posts/the-laundromat) opened for business. The [baskets learned to speak](https://lifelog.my/riclib/posts/the-operators-first-day). The [servants left their rooms](https://lifelog.my/riclib/posts/the-servants-uprising). The coffee machine was, regrettably, connected to the Sync Hub.

Everything was peaceful.

For about four hours.

---

## The Request

**riclib:** "I want to track habits."

**CLAUDE:** "Like... a habit tracker?"

**riclib:** "In Thymer. Using native primitives. Journal for input, dashboard for quick logging, stats calculated on the fly."

**THE SQUIRREL:** *materializes from behind a potted plant* "DID SOMEONE SAY STATS?"

---

## The Architecture (Final)

```
THE HABITHUB ARCHITECTURE (FINAL)

┌─────────────────────────────────────────────────────────┐
│                     INPUTS                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Journal  │  │Dashboard │  │ Future:  │              │
│  │ entries  │  │ buttons  │  │ API/agent│              │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘              │
│       └─────────────┴─────────────┘                     │
│                     │                                   │
│                     ▼                                   │
│  ┌─────────────────────────────────────────────────┐   │
│  │              HABIT PAGE LOG                      │   │
│  │         (line items with props)                  │   │
│  │                                                  │   │
│  │  item.props = {                                  │   │
│  │    habit_date: "2026-01-03",                    │   │
│  │    habit_value: 42                               │   │
│  │  }                                               │   │
│  │                                                  │   │
│  │  ← One log. Source of truth.                    │   │
│  │  ← Stats calculated from props.                 │   │
│  │  ← No database. No sync. No conflict.           │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  LINES OF DATABASE CODE: 0                             │
│  LINES OF SYNC CODE: 0                                 │
│  DEPENDENCIES: 0                                        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## The Moral

The Squirrel saw "habit data" and reached for IndexedDB.
The Lizard saw "habit data" and asked: "What's already there?"

**The best database is one file.**
**The best storage is what's already stored.**
**The best code is code you don't write.**

---

*Source: lifelog block_1767423147359527000*
