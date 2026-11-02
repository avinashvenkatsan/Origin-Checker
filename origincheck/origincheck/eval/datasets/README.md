# Evaluation datasets

No datasets are shipped. Add your own here (this folder is git-ignored except this file) and document each one below:

| name | source / license | collection dates | size (AI / human) | generators | known limitations |
|---|---|---|---|---|---|
| _none yet_ | — | — | — | — | **Not yet measured** |

## Manifest format (`image-manifest.csv`, `text-manifest.csv`)

```
path,label,split,source,generator,condition,language
imgs/a1.png,ai,tune,midjourney-export,midjourney-v6,original,
imgs/h1.jpg,human,heldout,own-photos,,jpeg-q60,
texts/t1.txt,ai,heldout,generated-2026-10,gpt-x,paraphrased,en
```

Requirements for a trustworthy evaluation:
- `tune` and `heldout` must not share items, near-duplicates, prompts, or authors/photographers.
- Include multiple generators, several human sources, and edited / compressed / paraphrased / translated / mixed-source conditions (use the `condition` column).
- Don't tune provider choice or thresholds on `heldout`. If you do, collect a fresh held-out set.
- Do not include content you lack rights or consent to send to the provider.
